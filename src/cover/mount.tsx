import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { splitShadowRootCss } from 'wxt/utils/split-shadow-root-css';
import { Cover, type CoverProps } from './cover';
import coverCss from './cover.css?inline';
import { PageCover, type PageCoverProps } from './page-cover';
import { Toast, type ToastProps } from './toast';

/**
 * Sites like YouTube shrink the root font size, so rem units would shrink the
 * cover with them. Shadow DOM styles use fixed pixels instead.
 */
const remToPx = (css: string) =>
  css.replace(/(-?\d*\.?\d+)rem\b/g, (_, value: string) => `${Number(value) * 16}px`);

// @property and @font-face only work at document level, not inside a shadow root.
const { documentCss, shadowCss } = splitShadowRootCss(remToPx(coverCss));

export const COVER_TAG = 'blackout-cover';
export const PAGE_COVER_TAG = 'blackout-page-cover';
export const TOAST_TAG = 'blackout-toast';

const PRESS_EVENTS = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'touchstart',
  'touchend',
  'click',
  'auxclick',
  'dblclick',
  'contextmenu',
] as const;

interface Mounted {
  host: HTMLElement;
  root: Root;
}

function ensureDocumentCss(doc: Document) {
  if (doc.querySelector('style[data-blackout-document-css]')) return;
  const style = doc.createElement('style');
  style.dataset.blackoutDocumentCss = '';
  style.textContent = documentCss;
  (doc.head ?? doc.documentElement).append(style);
}

/**
 * Renders `ui` into a new host element inside a Shadow DOM, so site styles
 * can't reach it, and appends the host to `parent`.
 */
function mountInShadow(
  parent: Element | ShadowRoot,
  tag: string,
  hostStyles: Record<string, string>,
  ui: ReactNode,
): Mounted {
  const doc = parent.ownerDocument;
  ensureDocumentCss(doc);

  const host = doc.createElement(tag);
  // Sites may hide elements their own code hasn't defined, as Reddit does, and the
  // host is never defined. It still hides along with what it sits in.
  for (const [property, value] of Object.entries({ display: 'block', visibility: 'inherit', ...hostStyles })) {
    host.style.setProperty(property, value, 'important');
  }
  // Keep presses and clicks on the cover from reaching the site's own handlers:
  // some act on press, like search suggestions. A click mustn't follow the link
  // when the covered item is a link itself.
  for (const type of PRESS_EVENTS) host.addEventListener(type, (event) => event.stopPropagation());
  host.addEventListener('click', (event) => event.preventDefault());
  // Pressing the cover mustn't move focus either: taking it from the search box
  // would close the suggestions before Reveal can be clicked.
  host.addEventListener('mousedown', (event) => event.preventDefault());

  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = shadowCss;
  const container = doc.createElement('div');
  container.style.height = '100%';
  shadow.append(style, container);
  parent.append(host);

  const root = createRoot(container);
  // Render synchronously so the cover is in place before the next paint.
  flushSync(() => root.render(ui));
  return { host, root };
}

function unmount(mounted: Mounted | undefined) {
  mounted?.root.unmount();
  mounted?.host.remove();
}

const itemCovers = new WeakMap<Element, Mounted>();

/**
 * Whether the site would show a cover added to `item` as a child. An item that
 * draws itself in a shadow root shows only the children its slots take in.
 */
function showsChildren(item: Element): boolean {
  return item.shadowRoot === null || item.shadowRoot.querySelector('slot:not([name])') !== null;
}

/**
 * Places a cover over `item`. When the site wouldn't show it as a child, it goes
 * inside the item's shadow root instead, opaque, since what the site draws there
 * isn't blurred.
 */
export function mountCover(item: Element, props: CoverProps): void {
  unmountCover(item);
  const beside = showsChildren(item);
  const mounted = mountInShadow(
    beside ? item : item.shadowRoot!,
    COVER_TAG,
    { position: 'absolute', inset: '0', 'z-index': '10' },
    <Cover {...props} opaque={props.opaque || !beside} />,
  );
  itemCovers.set(item, mounted);
  // A site's own element may draw itself in a shadow root only after the cover is in.
  if (item.shadowRoot === null && notYetDrawn(item)) moveCoverIfDrawnLater(item, props, mounted);
}

/** Whether `item` is a site's own element whose code hasn't run yet. */
function notYetDrawn(item: Element): boolean {
  if (!item.localName.includes('-')) return false;
  try {
    return !item.matches(':defined');
  } catch {
    return true;
  }
}

/** How long, and how often, to look for an item drawing itself after it is covered. */
const LATE_DRAW_MS = 5000;
const LATE_DRAW_CHECK_MS = 50;

/** Moves the cover inside `item`'s shadow root if one appears that wouldn't show it. */
function moveCoverIfDrawnLater(item: Element, props: CoverProps, mounted: Mounted) {
  const view = item.ownerDocument.defaultView;
  if (!view) return;
  const giveUpAt = Date.now() + LATE_DRAW_MS;
  const look = () => {
    // The cover was taken down or replaced meanwhile.
    if (itemCovers.get(item) !== mounted) return;
    if (item.shadowRoot) {
      if (!showsChildren(item)) mountCover(item, props);
      return;
    }
    if (Date.now() < giveUpAt) view.setTimeout(look, LATE_DRAW_CHECK_MS);
  };
  view.setTimeout(look, LATE_DRAW_CHECK_MS);
}

export function unmountCover(item: Element): void {
  unmount(itemCovers.get(item));
  itemCovers.delete(item);
}

const pageCovers = new WeakMap<Document, Mounted>();

/** Covers the whole page, from outside its body so hiding the body doesn't hide the cover. */
export function mountPageCover(doc: Document, props: PageCoverProps): void {
  unmountPageCover(doc);
  const mounted = mountInShadow(
    doc.documentElement,
    PAGE_COVER_TAG,
    // Nothing around it should hide it: it's the page's only way forward.
    { position: 'fixed', inset: '0', 'z-index': '2147483647', visibility: 'visible' },
    <PageCover {...props} />,
  );
  pageCovers.set(doc, mounted);
}

export function unmountPageCover(doc: Document): void {
  unmount(pageCovers.get(doc));
  pageCovers.delete(doc);
}

const toasts = new WeakMap<Document, Mounted>();

/**
 * Shows a toast in the page's bottom-right corner. It sits in the body, so a
 * full-page cover hides it with the rest of the page.
 */
export function mountToast(doc: Document, props: ToastProps): void {
  unmountToast(doc);
  const mounted = mountInShadow(
    doc.body ?? doc.documentElement,
    TOAST_TAG,
    { position: 'fixed', right: '24px', bottom: '24px', 'z-index': '2147483646' },
    <Toast {...props} />,
  );
  toasts.set(doc, mounted);
}

export function unmountToast(doc: Document): void {
  unmount(toasts.get(doc));
  toasts.delete(doc);
}
