import type { BlockedSource, SourceId } from '@/protection/state';
import { subredditSource } from '@/protection/subreddits';
import { readText, type ItemKind, type PageSubject, type SiteAdapter } from '../adapter';

const card = (selector: string): ItemKind => ({ selector, cover: 'card' });
const inline = (selector: string): ItemKind => ({ selector, cover: 'inline' });

const POST = 'shreddit-post, shreddit-ad-post';
const SUBREDDIT_HEADER = 'shreddit-subreddit-header';

/** What a subreddit's header shows: its name, title and description. */
function subredditHeaderText(header: Element): string {
  return ['prefixed-name', 'display-name', 'description'].map((name) => header.getAttribute(name) ?? '').join(' ');
}

/** The post or comment a link points to, as Reddit names them ("t3_…", "t1_…"). */
function linkedThing(href: string | null): string | null {
  const match = href && /\/comments\/([a-z0-9]+)(?:\/[^/]*)?(?:\/comment\/([a-z0-9]+))?/i.exec(href);
  if (!match) return null;
  return match[2] ? `t1_${match[2].toLowerCase()}` : `t3_${match[1]!.toLowerCase()}`;
}

/** A Reddit user as a source, from their name with or without "u/". */
function userSource(name: string | null): BlockedSource | null {
  const bare = name?.trim().replace(/^\/?u\//i, '');
  return bare ? { site: 'reddit', account: `u/${bare.toLowerCase()}`, name: `u/${bare}` } : null;
}

/** The subreddit or user a link points to, such as "/r/GTA6/" or "/user/someone/". */
function linkSource(href: string | null): BlockedSource | null {
  if (!href) return null;
  try {
    const [first, second] = new URL(href, 'https://www.reddit.com').pathname.split('/').filter(Boolean);
    if (!second) return null;
    if (first === 'r') return subredditSource(decodeURIComponent(second));
    if (first === 'user' || first === 'u') return userSource(decodeURIComponent(second));
  } catch {
    // A malformed link names no source.
  }
  return null;
}

/** The subreddit a page is in, from its address. */
function pageSubreddit(doc: Document): BlockedSource | null {
  const match = /^\/r\/([^/]+)/.exec(new URL(doc.location.href).pathname);
  return match ? subredditSource(decodeURIComponent(match[1]!)) : null;
}

/** The sources that could be read, each once. */
function distinctSources(sources: (BlockedSource | null)[]): BlockedSource[] {
  return sources.filter(
    (source, index): source is BlockedSource =>
      source !== null && sources.findIndex((other) => other?.account === source.account) === index,
  );
}

/**
 * A subreddit's own pages (its feeds, wiki and about pages) are about the
 * subreddit: its name, title and description say what that is.
 */
function subredditPageSubject(doc: Document, path: string): PageSubject | null {
  const source = subredditSource(/^\/r\/([^/]+)/.exec(path)?.[1]);
  if (!source) return null;
  // Popular and All are feeds of every subreddit, not one.
  if (['r/popular', 'r/all'].includes(source.account)) return null;
  const header = doc.querySelector(SUBREDDIT_HEADER);
  return {
    key: source.account,
    text: [source.name, header ? subredditHeaderText(header) : ''].join(' '),
    sources: [source],
  };
}

/** A post's subreddit, then its author. */
function postSources(post: Element): BlockedSource[] {
  return distinctSources([subredditSource(post.getAttribute('subreddit-prefixed-name')), userSource(post.getAttribute('author'))]);
}

export const reddit: SiteAdapter = {
  site: 'reddit',
  itemKinds: [
    // Posts in feeds (home, popular, a subreddit), and the thread's own post.
    card('shreddit-post'),
    card('shreddit-ad-post'),
    // A comment's own text. Its replies sit beside it, each an item of its own.
    inline('shreddit-comment [slot="comment"]'),
    // Suggested communities, a subreddit's highlights, and related posts beside a thread.
    card('community-card'),
    card('community-highlight-card'),
    card('reddit-pdp-right-rail-post'),
    // "People also ask about" beside a thread: its questions, and the answer it opens under one.
    card('aside#answers-suggested-queries-pdp'),
    // Ads among a thread's comments and beside the feed.
    card('shreddit-comment-tree-ad'),
    card('shreddit-comments-page-ad'),
    card('shreddit-sidebar-ad'),
    // Every row of the search box's dropdown, in its shadow root: suggestions as you type,
    // and before you do, trending searches and communities and your recent searches.
    inline('#search-dropdown-results-container li'),
    // Signed in, the empty box also shows recent communities as tiles, and recent searches.
    card('[data-suggested-subreddit-dismiss-item]'),
    inline('.recent-search-item-container'),
    // A signed-in user's recent posts beside the home feed.
    card('recent-posts [slot="posts"] > div'),
    // Search results: posts, comments, communities, people and media, Reddit Answers'
    // summary of them, and related searches.
    card('[data-testid="search-post-unit"]'),
    card('[data-testid="search-post-with-content-preview"]'),
    card('[data-testid="search-sdui-post"]'),
    card('[data-testid="sdui-post-unit"]'),
    card('[data-testid="search-sdui-comment-unit"]'),
    card('[data-testid="search-community"]'),
    card('[data-testid="search-author"]'),
    card('[data-id="search-media-post-unit"]'),
    card('[id^="section_"][id*="answers"]'),
    inline('[data-testid="sources-header"]'),
    inline('a[data-testid="search-sdui-query-suggestion"]'),
    // A user's profile: their comments, and the links, communities and trophies beside them.
    card('shreddit-profile-comment'),
    inline('aside[aria-label="Profile information"] li'),
    // The community's box beside its threads, and everything beside its feed: name,
    // description, rules and links.
    card('aside[aria-label="Community information"]'),
    card('#subreddit-right-rail__partial'),
  ],
  shadowHosts: ['reddit-search-large'],
  observedAttributes: ['post-title'],
  itemText(item) {
    // A community box draws its name and description from attributes, inside its shadow root.
    const headers = [item, ...item.querySelectorAll(SUBREDDIT_HEADER)].filter((element) => element.matches(SUBREDDIT_HEADER));
    // A recent search draws its query inside its own shadow root; its delete button names it.
    const labels = item.matches('.recent-search-item-container')
      ? Array.from(item.querySelectorAll('[aria-label]'), (element) => element.getAttribute('aria-label'))
      : [];
    return [readText(item), ...headers.map(subredditHeaderText), ...labels].join(' ');
  },
  itemSources(item) {
    const post = item.closest(POST);
    if (post) return postSources(post);
    const comment = item.closest('shreddit-comment');
    if (comment) return distinctSources([userSource(comment.getAttribute('author'))]);
    // Cards and suggestions link the community or user they're about.
    return distinctSources([item, ...item.querySelectorAll('a[href]')].map((link) => linkSource(link.getAttribute('href'))));
  },
  pagePlace(doc): SourceId | null {
    return pageSubreddit(doc);
  },
  itemKey(item) {
    const post = item.closest(POST);
    if (post) return post.getAttribute('id') ?? post.getAttribute('permalink');
    const comment = item.closest('shreddit-comment');
    if (comment) return comment.getAttribute('thingid');
    if (item.matches('shreddit-profile-comment')) return item.getAttribute('comment-id');
    // Search results and other cards link the post or comment they show.
    for (const link of [item, ...item.querySelectorAll('a[href]')]) {
      const thing = linkedThing(link.getAttribute('href'));
      if (thing) return thing;
    }
    return null;
  },
  pageSubject(doc) {
    const path = new URL(doc.location.href).pathname;
    const match = /^\/r\/([^/]+)\/comments\/([a-z0-9]+)/i.exec(path);
    if (!match) return subredditPageSubject(doc, path);
    const [, subreddit, postId] = match;
    // The same key as the thread's own post, so seeing both counts once.
    const key = `t3_${postId!.toLowerCase()}`;
    // After navigating inside Reddit, the previous thread can stay on the page a moment.
    const post = doc.querySelector(`shreddit-post[id="${key}"]`);
    const title = post?.getAttribute('post-title');
    if (!post || !title) return { key, text: null };
    // The page shows the subreddit's name above the thread, so it is checked too.
    const flair = post.querySelector('shreddit-post-flair');
    const body = post.querySelector('[slot="text-body"]');
    return {
      key,
      text: [`r/${subreddit}`, title, flair && readText(flair), body && readText(body)].filter(Boolean).join(' '),
      sources: postSources(post),
    };
  },
};
