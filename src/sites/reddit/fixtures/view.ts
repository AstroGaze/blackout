// Page-seam views of Reddit items, named the way a user would name them.

import * as page from '@/test/page';

/** A post's title, a suggestion's query, else all of an item's text. */
export function redditTitle(item: Element): string {
  const named =
    item.getAttribute('post-title') ??
    item.getAttribute('data-label') ??
    item.querySelector('[slot="title"], h2, h3')?.textContent ??
    item.textContent;
  return (named ?? '').replace(/\s+/g, ' ').trim();
}

export const viewItem = (item: Element) => page.viewItem(item, redditTitle);
export const coveredTitles = (selector: string, root?: ParentNode) => page.coveredTitles(selector, redditTitle, root);
export const shownTitles = (selector: string, root?: ParentNode) => page.shownTitles(selector, redditTitle, root);
