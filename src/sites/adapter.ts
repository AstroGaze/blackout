import type { Site } from '@/protection/state';

/** What a page guard needs to know about one site. Adapters contain no matching logic. */
export interface SiteAdapter {
  site: Site;
  /** Selectors for every kind of checkable item on the site. */
  itemSelectors: string[];
  /** All the text of an item that should be checked. */
  itemText(item: Element): string;
  /**
   * Identifies the content an item currently shows (a video, a post), so a reveal
   * survives the site redrawing it but not the site reusing it for other content.
   * Null when the item has no identity of its own; its text is used instead.
   */
  itemKey(item: Element): string | null;
}

/**
 * The text of every text node under `element`, separated by spaces, so text in
 * neighbouring elements (a title and its channel) can't run together into one word.
 */
export function readText(element: Element): string {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeValue) parts.push(node.nodeValue);
  }
  return parts.join(' ');
}
