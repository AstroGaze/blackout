import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { splitShadowRootCss } from 'wxt/utils/split-shadow-root-css';
import { Cover, type CoverProps } from './cover';
import coverCss from './cover.css?inline';

/**
 * Sites like YouTube shrink the root font size, so rem units would shrink the
 * cover with them. Shadow DOM styles use fixed pixels instead.
 */
const remToPx = (css: string) =>
  css.replace(/(-?\d*\.?\d+)rem\b/g, (_, value: string) => `${Number(value) * 16}px`);

// @property and @font-face only work at document level, not inside a shadow root.
const { documentCss, shadowCss } = splitShadowRootCss(remToPx(coverCss));

export const COVER_TAG = 'blackout-cover';
const roots = new WeakMap<Element, { host: HTMLElement; root: Root }>();

function ensureDocumentCss(doc: Document) {
  if (doc.querySelector('style[data-blackout-document-css]')) return;
  const style = doc.createElement('style');
  style.dataset.blackoutDocumentCss = '';
  style.textContent = documentCss;
  (doc.head ?? doc.documentElement).append(style);
}

/** Places a cover over `item`, inside a Shadow DOM so site styles can't reach it. */
export function mountCover(item: Element, props: CoverProps): void {
  unmountCover(item);
  const doc = item.ownerDocument;
  ensureDocumentCss(doc);

  const host = doc.createElement(COVER_TAG);
  for (const [property, value] of [
    ['display', 'block'],
    ['position', 'absolute'],
    ['inset', '0'],
    ['z-index', '10'],
  ] as const) {
    host.style.setProperty(property, value, 'important');
  }
  // Keep clicks on the cover from reaching the site's own handlers, or following
  // the link when the covered item is a link itself.
  host.addEventListener('click', (event) => {
    event.stopPropagation();
    event.preventDefault();
  });

  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = shadowCss;
  const container = doc.createElement('div');
  container.style.height = '100%';
  shadow.append(style, container);
  item.append(host);

  const root = createRoot(container);
  // Render synchronously so the label is in place before the next paint.
  flushSync(() => root.render(<Cover {...props} />));
  roots.set(item, { host, root });
}

export function unmountCover(item: Element): void {
  const mounted = roots.get(item);
  if (!mounted) return;
  roots.delete(item);
  mounted.root.unmount();
  mounted.host.remove();
}
