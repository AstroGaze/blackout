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
  doc.body.replaceChildren(template.content);
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

/** What the user sees for each item matching `selector`. */
export function viewItems(selector: string, titleOf: TitleOf = wholeText): ItemView[] {
  return Array.from(document.querySelectorAll(selector), (item) => viewItem(item, titleOf));
}

export function viewItem(item: Element, titleOf: TitleOf = wholeText): ItemView {
  const title = titleOf(item);
  const label = coverLabel(item);
  if (label !== null) return { title, state: 'covered', reason: label };
  const view = item.ownerDocument.defaultView ?? window;
  if (view.getComputedStyle(item).visibility === 'hidden') return { title, state: 'withheld' };
  return { title, state: 'shown' };
}

export function coveredTitles(selector: string, titleOf: TitleOf = wholeText): string[] {
  return viewItems(selector, titleOf)
    .filter((view) => view.state === 'covered')
    .map((view) => view.title);
}

const coverOf = (item: Element) => item.querySelector(COVER_TAG)?.shadowRoot ?? null;

/** The topic named on the cover over `item`, or null if it isn't covered. */
function coverLabel(item: Element): string | null {
  return coverOf(item)?.querySelector('[data-slot="cover-topic"]')?.textContent ?? null;
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

const pageCover = () => document.querySelector(PAGE_COVER_TAG)?.shadowRoot ?? null;

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
