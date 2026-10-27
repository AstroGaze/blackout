// Helpers for page-seam tests: put a page into the simulated DOM and read back
// what the user would see on it.

import { COVER_TAG, PAGE_COVER_TAG } from '@/cover/mount';

/** Replaces the page body and tab title with those of `html`, as if the site rendered it. */
export function renderPage(html: string): void {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.title = parsed.title;
  document.body.replaceChildren(
    ...Array.from(parsed.body.childNodes, (node) => document.importNode(node, true)),
  );
}

/** Lets pending storage reads and mutation callbacks run. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
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
  if (getComputedStyle(item).visibility === 'hidden') return { title, state: 'withheld' };
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
