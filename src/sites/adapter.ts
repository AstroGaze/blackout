import type { CoverLayout } from '@/cover/cover';
import type { Site } from '@/protection/state';

export type { CoverLayout };

/** One kind of checkable item on a site, such as a video tile or a comment. */
export interface ItemKind {
  selector: string;
  cover: CoverLayout;
}

/** What a page guard needs to know about one site. Adapters contain no matching logic. */
export interface SiteAdapter {
  site: Site;
  /**
   * Every kind of checkable item on the site. When items nest, only the
   * outermost one is checked and covered, together with everything inside it.
   */
  itemKinds: ItemKind[];
  /** All the text of an item that should be checked. */
  itemText(item: Element): string;
  /**
   * Identifies the content an item currently shows (a video, a post), so a reveal
   * survives the site redrawing it but not the site reusing it for other content.
   * Null when the item has no identity of its own; its text is used instead.
   */
  itemKey(item: Element): string | null;
  /**
   * What the page as a whole is about, such as the video on a watch page, or
   * null when it isn't about one thing (a feed, search results).
   */
  pageSubject(doc: Document): PageSubject | null;
  /** Attributes whose changes can change an item or the page subject. */
  observedAttributes: string[];
}

export interface PageSubject {
  /** Identifies the page's subject, so navigating to another one is noticed. */
  key: string;
  /** The text to check, or null while the site hasn't rendered it yet. */
  text: string | null;
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
