// Helpers for page-seam tests: put a page into the simulated DOM and read back
// what the user would see on it.

import { COVER_TAG, PAGE_COVER_TAG, TOAST_TAG } from '@/cover/mount';

/**
 * Replaces the page body and tab title with those of `html`, as if the site
 * rendered it. It parses with a template in `doc`: a separate parsed document per
 * page stays in memory in the simulated DOM, and the saved pages are large. The
 * body goes in as one change, as a site's render would.
 */
export function renderPage(html: string, doc: Document = document): void {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '';
  const decoder = doc.createElement('textarea');
  decoder.innerHTML = title;
  doc.title = decoder.value;
  const bodyStart = html.indexOf('>', html.search(/<body[\s>]/i)) + 1;
  const template = doc.createElement('template');
  template.innerHTML = html.slice(bodyStart, html.search(/<\/body>/i));
  attachDeclaredShadowRoots(template.content);
  doc.body.replaceChildren(template.content);
}

/**
 * Attaches the shadow roots a saved page declares with `<template shadowrootmode>`,
 * as the browser's parser does, so they are in place when the page goes in.
 */
function attachDeclaredShadowRoots(root: ParentNode): void {
  for (const declared of Array.from(root.querySelectorAll<HTMLTemplateElement>('template[shadowrootmode]'))) {
    const host = declared.parentElement;
    if (!host || host.shadowRoot) continue;
    const shadow = host.attachShadow({ mode: declared.getAttribute('shadowrootmode') === 'closed' ? 'closed' : 'open' });
    attachDeclaredShadowRoots(declared.content);
    shadow.append(declared.content);
    declared.remove();
  }
}

/**
 * Lets pending storage reads, mutation callbacks and the guard's later turns of
 * checking run, until the pages have stopped changing for a few turns. Pages in
 * windows of their own, such as frames, need passing in.
 */
export async function settle(...docs: Document[]): Promise<void> {
  let changed = false;
  const observers = (docs.length > 0 ? docs : [document]).map((doc) => {
    const view = doc.defaultView ?? window;
    const observer = new view.MutationObserver(() => {
      changed = true;
    });
    observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    return observer;
  });
  try {
    for (let quiet = 0, turn = 0; quiet < 3 && turn < 500; turn++) {
      changed = false;
      await new Promise((resolve) => setTimeout(resolve, 0));
      quiet = changed ? 0 : quiet + 1;
    }
  } finally {
    for (const observer of observers) observer.disconnect();
  }
}

export type ItemView =
  | { title: string; state: 'shown' }
  | { title: string; state: 'withheld' }
  | { title: string; state: 'covered'; reason: string };

/** Names an item in test output, for example by its title. */
export type TitleOf = (item: Element) => string;

const wholeText: TitleOf = (item) => (item.textContent ?? '').replace(/\s+/g, ' ').trim();

/** What the user sees for each item matching `selector`, in the page or in one of its shadow roots. */
export function viewItems(selector: string, titleOf: TitleOf = wholeText, root: ParentNode = document): ItemView[] {
  return Array.from(root.querySelectorAll(selector), (item) => viewItem(item, titleOf));
}

export function viewItem(item: Element, titleOf: TitleOf = wholeText): ItemView {
  const title = titleOf(item);
  const label = coverLabel(item);
  if (label !== null) return { title, state: 'covered', reason: label };
  const view = item.ownerDocument.defaultView ?? window;
  if (view.getComputedStyle(item).visibility === 'hidden') return { title, state: 'withheld' };
  return { title, state: 'shown' };
}

export function coveredTitles(selector: string, titleOf: TitleOf = wholeText, root: ParentNode = document): string[] {
  return viewItems(selector, titleOf, root)
    .filter((view) => view.state === 'covered')
    .map((view) => view.title);
}

export function shownTitles(selector: string, titleOf: TitleOf = wholeText, root: ParentNode = document): string[] {
  return viewItems(selector, titleOf, root)
    .filter((view) => view.state === 'shown')
    .map((view) => view.title);
}

/** Whether the user could see `host`: a site's stylesheet may hide it, as Reddit's hides elements it doesn't know. */
const isVisible = (host: Element | null | undefined): host is Element =>
  !!host && (host.ownerDocument.defaultView ?? window).getComputedStyle(host).visibility !== 'hidden';

/** The cover over `item`: beside its content, or inside its shadow root when the site wouldn't show it beside. */
const coverOf = (item: Element) => {
  const inShadow = Array.from(item.shadowRoot?.children ?? []).find((child) => child.localName === COVER_TAG);
  const host = item.querySelector(`:scope > ${COVER_TAG}`) ?? inShadow ?? item.querySelector(COVER_TAG);
  return isVisible(host) ? host.shadowRoot : null;
};

/** The topic named on the cover over `item`, or null if it isn't covered. */
function coverLabel(item: Element): string | null {
  return coverOf(item)?.querySelector('[data-slot="cover-topic"]')?.textContent ?? null;
}

/**
 * The text on the page matching `pattern` that a user can read: not hidden, and
 * not under a cover. Open shadow roots count. `ignore` names elements no one sees,
 * such as text only for screen readers.
 */
export function readableText(pattern: RegExp, { ignore }: { ignore?: string } = {}): string[] {
  const view = document.defaultView ?? window;
  const readable = (element: Element) => {
    for (let current: Element | null = element; current; ) {
      if (current.localName === COVER_TAG || current.localName === PAGE_COVER_TAG) return false;
      if (current.getAttribute('data-blackout') === 'covered' || (current as HTMLElement).hidden) return false;
      if (ignore && current.matches(ignore)) return false;
      if (view.getComputedStyle(current).visibility === 'hidden') return false;
      const root = current.getRootNode();
      current = current.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
    }
    return true;
  };
  const found: string[] = [];
  const walk = (root: Node) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const shadow = (node as Element).shadowRoot;
        if (shadow) walk(shadow);
        continue;
      }
      const text = (node.nodeValue ?? '').replace(/\s+/g, ' ').trim();
      const parent = node.parentElement;
      if (text && pattern.test(text) && parent && !['SCRIPT', 'STYLE', 'TEMPLATE'].includes(parent.tagName) && readable(parent)) {
        found.push(text);
      }
    }
  };
  walk(document.body);
  return found;
}

/** Whether `element` looks blurred: it or an element around it has a blur filter. */
export function isBlurred(element: Element): boolean {
  const view = element.ownerDocument.defaultView ?? window;
  for (let current: Element | null = element; current; current = current.parentElement) {
    if (view.getComputedStyle(current).filter.includes('blur(')) return true;
  }
  return false;
}

/** Whether focus (Tab) and screen readers can reach `element`. */
export function isKeyboardReachable(element: Element): boolean {
  return element.closest('[inert]') === null;
}

/** Clicks the button inside `item`'s cover whose text is `name`. */
export function clickCoverButton(item: Element, name: string): void {
  const button = Array.from(coverOf(item)?.querySelectorAll('button') ?? []).find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  if (!button) throw new Error(`No "${name}" button on the cover`);
  button.click();
}

export type PageView =
  | { title: string; state: 'shown' }
  | { title: string; state: 'hidden' }
  | { title: string; state: 'covered'; reason: string };

const pageCover = () => {
  const host = document.querySelector(PAGE_COVER_TAG);
  return isVisible(host) ? host.shadowRoot : null;
};

/** What the user sees of the page as a whole, including the tab title. */
export function viewPage(): PageView {
  const title = document.title;
  const reason = pageCover()?.querySelector('[data-slot="cover-topic"]')?.textContent;
  if (reason != null) return { title, state: 'covered', reason };
  if (getComputedStyle(document.body).visibility === 'hidden') return { title, state: 'hidden' };
  return { title, state: 'shown' };
}

/** Clicks the button on the full-page cover whose text is `name`. */
export function clickPageCoverButton(name: string): void {
  const button = Array.from(pageCover()?.querySelectorAll('button') ?? []).find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  if (!button) throw new Error(`No "${name}" button on the page cover`);
  button.click();
}

export interface ToastView {
  title: string;
  text: string;
  buttons: string[];
}

const toast = () => document.querySelector(TOAST_TAG)?.shadowRoot ?? null;

/** The Suggested Block toast on the page, or null when none is offered. */
export function viewToast(): ToastView | null {
  const root = toast();
  if (!root) return null;
  const text = (slot: string) => root.querySelector(`[data-slot="${slot}"]`)?.textContent?.trim() ?? '';
  const buttons = Array.from(root.querySelectorAll('button'), (button) => button.textContent?.trim() ?? '');
  return { title: text('toast-title'), text: text('toast-text'), buttons };
}

/** Clicks the button on the toast whose text is `name`. */
export function clickToastButton(name: string): void {
  const button = Array.from(toast()?.querySelectorAll('button') ?? []).find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  if (!button) throw new Error(`No "${name}" button on the toast`);
  button.click();
}
