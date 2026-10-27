// Page-seam views of YouTube items, named the way a user would name them.

import * as page from '@/test/page';

/** An item's title, comment text, chat message or suggestion, else all its text. */
export function youtubeTitle(item: Element): string {
  const named = [
    '#content-text',
    '#message',
    '[role="option"]',
    '.message',
    '.ytp-modern-videowall-still-info-title',
    'h3',
  ]
    .map((selector) => item.querySelector(selector))
    .find((element) => element !== null);
  return (named?.textContent ?? item.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export const viewItem = (item: Element) => page.viewItem(item, youtubeTitle);
export const viewItems = (selector: string) => page.viewItems(selector, youtubeTitle);
export const coveredTitles = (selector: string) => page.coveredTitles(selector, youtubeTitle);
