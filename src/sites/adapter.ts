import type { CoverLayout } from '@/cover/cover';
import type { BlockedSource, Site, SourceId } from '@/protection/state';

export type { CoverLayout };

/** One kind of checkable item on a site, such as a video tile or a comment. */
export interface ItemKind {
  selector: string;
  cover: CoverLayout;
  /**
   * Shows another item's content elsewhere on the page, like a hover preview.
   * It stays hidden while that item is, matched by item key.
   */
  mirrors?: boolean;
}

/** What a page guard needs to know about one site. Adapters contain no matching logic. */
export interface SiteAdapter {
  site: Site;
  /**
   * Every kind of checkable item on the site. When items nest, only the
   * outermost one is checked and covered, together with everything inside it.
   */
  itemKinds: ItemKind[];
  /**
   * Every picture of a video or post (thumbnails, hover previews), which the
   * blur-all-thumbnails switch blurs. None may contain an item, whose cover would
   * be blurred with it.
   */
  thumbnails?: string[];
  /**
   * Elements whose open shadow roots hold items, such as a search box that keeps
   * its suggestions there. Items inside them are hidden and checked like any other.
   */
  shadowHosts?: string[];
  /** All the text of an item that should be checked. */
  itemText(item: Element): string;
  /**
   * The accounts an item comes from, such as a video's channel, or a Reddit post's
   * subreddit and author; empty when the site doesn't show them there. Blocking any
   * one hides the item. The first is the one its cover offers to block.
   */
  itemSources(item: Element): BlockedSource[];
  /**
   * The community the page is in, such as a thread's subreddit, or null. Everything
   * on the page counts as posted there, which makes a topic's own community context.
   */
  pagePlace?(doc: Document): SourceId | null;
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
  /**
   * Guards site interactions that can show a Hidden Item's content without
   * touching the item, such as keyboard shortcuts. Returns a function that stops it.
   */
  protectInteractions?(context: SiteGuardContext): () => void;
}

export interface SiteGuardContext {
  win: Window & typeof globalThis;
  /** Whether the item `element` belongs to has passed its check or been revealed. */
  isShown(element: Element): boolean;
}

export interface PageSubject {
  /** Identifies the page's subject, so navigating to another one is noticed. */
  key: string;
  /** The text to check, or null while the site hasn't rendered it yet. */
  text: string | null;
  /** The accounts it comes from, such as a video's channel, when known; the first is the one to offer blocking. */
  sources?: BlockedSource[];
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
