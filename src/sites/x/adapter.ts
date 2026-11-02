import type { BlockedSource } from '@/protection/state';
import { distinctSources, readText, type ItemKind, type PageSubject, type SiteAdapter } from '../adapter';

const card = (selector: string): ItemKind => ({ selector, cover: 'card' });
const inline = (selector: string): ItemKind => ({ selector, cover: 'inline' });

/** An X handle, without its "@". */
const HANDLE = String.raw`\w{1,15}`;

/** First path segments that are X's own pages rather than accounts. */
const RESERVED_PATHS = new Set([
  'home', 'explore', 'search', 'notifications', 'messages', 'i', 'settings', 'compose', 'hashtag', 'lists',
  'communities', 'jobs', 'premium', 'premium_sign_up', 'login', 'logout', 'signup', 'tos', 'privacy', 'bookmarks',
  'grok', 'account', 'intent', 'share', 'download', 'jf', 'about', 'help',
]);

/** A post's address on X: an account's post, or X's own form for any post ("/i/status/…", "/i/web/status/…"). */
const POST_PATH = new RegExp(String.raw`^/(?:(${HANDLE})|i(?:/web)?)/status/(\d+)`);
/** A post's own page, or its photo or video opened over it; not the lists of its quotes or reposts. */
const POST_PAGE_PATH = new RegExp(String.raw`${POST_PATH.source}(?:/(?:photo|video)/\d+)?/?$`);

/** An X account as a source, from its handle with or without "@". */
function xAccount(handle: string | null | undefined): BlockedSource | null {
  const bare = handle?.trim().replace(/^@/, '');
  if (!bare || !new RegExp(`^${HANDLE}$`).test(bare) || RESERVED_PATHS.has(bare.toLowerCase())) return null;
  return { site: 'x', account: `@${bare.toLowerCase()}`, name: `@${bare}` };
}

/** The path a link on X points to, or null for another site. */
function xPath(href: string | null): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, 'https://x.com');
    return ['x.com', 'www.x.com', 'mobile.x.com', 'twitter.com'].includes(url.hostname) ? url.pathname : null;
  } catch {
    return null;
  }
}

/** The account a link points to, such as "/RockstarGames"; null for a post, a page of X's own, or another site. */
function linkedAccount(href: string | null): BlockedSource | null {
  const match = new RegExp(`^/(${HANDLE})/?$`).exec(xPath(href) ?? '');
  return match ? xAccount(match[1]) : null;
}

/** The post a link points to, such as "/RockstarGames/status/2110717537964953810"; not its photos or quotes. */
function linkedPost(href: string | null): string | null {
  const path = xPath(href);
  const match = path && POST_PATH.exec(path);
  return match && path.slice(match[0].length).replace(/\/$/, '') === '' ? `status/${match[2]}` : null;
}

const PICTURE_TESTID = 'UserAvatar-Container-';

/**
 * The accounts an item shows: its author first, then whoever reposted it and a
 * quoted post's author. Accounts mentioned in a post's text don't count: X keeps
 * that text, and bios, in `dir="auto"` blocks.
 */
function itemAccounts(item: Element): BlockedSource[] {
  const inText = (link: Element) => {
    const block = link.closest('[dir="auto"]');
    return block !== null && item.contains(block);
  };
  const links = [item, ...item.querySelectorAll('a[href], [data-href]')].filter((link) => !inText(link));
  const sourceOf = (link: Element) => linkedAccount(link.getAttribute('href') ?? link.getAttribute('data-href'));
  const reposter = (link: Element) => link.querySelector('[data-testid="socialContext"]') !== null;
  // Some accounts are named only by their picture: a quoted post's author, whose
  // name X draws without a link, and a suggested account in the search box.
  const pictured = Array.from(item.querySelectorAll(`[data-testid^="${PICTURE_TESTID}"]`), (picture) =>
    xAccount(picture.getAttribute('data-testid')!.slice(PICTURE_TESTID.length)),
  );
  return distinctSources([
    ...links.filter((link) => !reposter(link)).map(sourceOf),
    ...links.filter(reposter).map(sourceOf),
    ...pictured,
  ]);
}

/** The account a page belongs to, from its address: a profile, or a post's author. */
function pageAccount(path: string): BlockedSource | null {
  return xAccount(new RegExp(`^/(${HANDLE})(?:/|$)`).exec(path)?.[1]);
}

/** The text in `root` outside posts, up to `end` if given, such as a profile's header before its tabs. */
function textBefore(root: Element, end: Element | null): string {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (end && end.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) break;
    if (node.nodeValue && !node.parentElement?.closest('article')) parts.push(node.nodeValue);
  }
  return parts.join(' ');
}

/** A single post's page: the post itself, once X shows it. */
function postSubject(doc: Document, handle: string | undefined, id: string): PageSubject {
  const key = `status/${id}`;
  // The page's own post links to itself; after navigating, the previous one can stay a moment.
  const post = Array.from(doc.querySelectorAll('article')).find((article) =>
    Array.from(article.querySelectorAll('a[href*="/status/"]')).some((link) => linkedPost(link.getAttribute('href')) === key),
  );
  if (!post) return { key, text: null };
  const author = xAccount(handle);
  // Its text, its author's name and a quoted post's, as the page shows them.
  return { key, text: readText(post), sources: distinctSources([author, ...itemAccounts(post)]) };
}

/**
 * A profile is about its account: its name, handle and bio say what that is, as
 * a subreddit's header does on Reddit. They're everything above the profile's tabs.
 */
function profileSubject(doc: Document, source: BlockedSource): PageSubject {
  const main = doc.querySelector('main');
  // An account that doesn't exist, is suspended or has blocked the user has no
  // tabs: what the page says about it is all there is to check.
  const header = main ? textBefore(main, main.querySelector('[role="tablist"]')) : '';
  // After navigating, the previous profile's header can stay a moment: wait for this one's handle.
  const shown = header.toLowerCase().includes(source.account);
  return { key: source.account, text: shown ? header : null, sources: [source] };
}

/** A profile's address, on any of its tabs. */
const PROFILE_PATH = new RegExp(`^/${HANDLE}(?:/(?:with_replies|media|likes|highlights|articles|affiliates|superfollows))?/?$`);

export const x: SiteAdapter = {
  site: 'x',
  itemKinds: [
    // Posts everywhere: timelines, a post's page and its replies, search results,
    // profiles and notifications. A quoted post is inside the post quoting it.
    card('article'),
    // Logged out, X shows replies and suggested accounts as links around a card.
    card('[role="link"][data-href]'),
    // Signed in: suggested accounts, trends and the explore page's featured event.
    card('[data-testid="UserCell"]'),
    card('[data-testid="trend"]'),
    card('[data-testid="eventHero"]'),
    // A live broadcast beside the timeline.
    card('[data-testid="sidebarColumn"] [data-testid="placementTracking"]'),
    // The card that opens over an account's name: its name and bio.
    card('[data-testid="HoverCard"]'),
    // Every row of the search box's dropdown: your recent searches before you type,
    // then suggested searches and accounts.
    inline('[id^="typeaheadDropdown"] [role="option"]'),
  ],
  observedAttributes: [],
  itemText(item) {
    return readText(item);
  },
  itemSources(item) {
    return itemAccounts(item);
  },
  itemKey(item) {
    for (const link of [item, ...item.querySelectorAll('a[href*="/status/"]')]) {
      const post = linkedPost(link.getAttribute('href') ?? link.getAttribute('data-href'));
      if (post) return post;
    }
    return null;
  },
  pageSubject(doc) {
    const path = new URL(doc.location.href).pathname;
    const post = POST_PAGE_PATH.exec(path);
    if (post) return postSubject(doc, post[1], post[2]!);
    const profile = PROFILE_PATH.test(path) ? pageAccount(path) : null;
    return profile ? profileSubject(doc, profile) : null;
  },
};
