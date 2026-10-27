// Helpers for page-seam tests: put a page into the simulated DOM and read back
// what the user would see on it.

import { COVER_TAG } from '@/cover/mount';

/** Replaces the page body with the body of `html`, as if the site rendered it. */
export function renderPage(html: string): void {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
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

/** What the user sees for each item matching `selector`. */
export function viewItems(selector: string): ItemView[] {
  return Array.from(document.querySelectorAll(selector), viewItem);
}

export function viewItem(item: Element): ItemView {
  const title = titleOf(item);
  const label = coverLabel(item);
  if (label !== null) return { title, state: 'covered', reason: label };
  if (getComputedStyle(item).visibility === 'hidden') return { title, state: 'withheld' };
  return { title, state: 'shown' };
}

export function coveredTitles(selector: string): string[] {
  return viewItems(selector)
    .filter((view) => view.state === 'covered')
    .map((view) => view.title);
}

function titleOf(item: Element): string {
  const heading = item.querySelector('h3');
  return (heading?.textContent ?? item.textContent ?? '').replace(/\s+/g, ' ').trim();
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
