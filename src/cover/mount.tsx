import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { splitShadowRootCss } from 'wxt/utils/split-shadow-root-css';
import { Cover, type CoverProps } from './cover';
import coverCss from './cover.css?inline';
import { PageCover, type PageCoverProps } from './page-cover';

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
  parent: Element,
  tag: string,
  hostStyles: Record<string, string>,
  ui: ReactNode,
): Mounted {
  const doc = parent.ownerDocument;
  ensureDocumentCss(doc);

  const host = doc.createElement(tag);
  for (const [property, value] of Object.entries({ display: 'block', ...hostStyles })) {
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

/** Places a cover over `item`. */
export function mountCover(item: Element, props: CoverProps): void {
  unmountCover(item);
  const mounted = mountInShadow(
    item,
    COVER_TAG,
    { position: 'absolute', inset: '0', 'z-index': '10' },
    <Cover {...props} />,
  );
  itemCovers.set(item, mounted);
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
    { position: 'fixed', inset: '0', 'z-index': '2147483647' },
    <PageCover {...props} />,
  );
  pageCovers.set(doc, mounted);
}

export function unmountPageCover(doc: Document): void {
  unmount(pageCovers.get(doc));
  pageCovers.delete(doc);
}
