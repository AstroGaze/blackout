// Page-seam views of X items, named the way a user would name them.

import * as page from '@/test/page';

/** A post's text, else all of an item's text. */
export function xTitle(item: Element): string {
  const named = item.querySelector('[data-testid="tweetText"], [dir="auto"]')?.textContent ?? item.textContent;
  return (named ?? '').replace(/\s+/g, ' ').trim();
}

export const viewItem = (item: Element) => page.viewItem(item, xTitle);
export const coveredTitles = (selector: string, root?: ParentNode) => page.coveredTitles(selector, xTitle, root);
export const shownTitles = (selector: string, root?: ParentNode) => page.shownTitles(selector, xTitle, root);
