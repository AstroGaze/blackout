import type { BlockedSource, SourceId } from '@/protection/state';
import { subredditSource } from '@/protection/subreddits';
import { readText, type ItemKind, type SiteAdapter } from '../adapter';

const card = (selector: string): ItemKind => ({ selector, cover: 'card' });
const inline = (selector: string): ItemKind => ({ selector, cover: 'inline' });

const POST = 'shreddit-post, shreddit-ad-post';

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
    // "People also ask about" questions beside a thread.
    inline('#answers-suggested-queries-pdp a'),
    // Ads among a thread's comments and beside the feed.
    card('shreddit-comment-tree-ad'),
    card('shreddit-comments-page-ad'),
    card('shreddit-sidebar-ad'),
    // Search suggestions: queries, communities and users, in the search box's shadow root.
    inline('li[data-testid^="search-sdui-"]'),
  ],
  shadowHosts: ['reddit-search-large'],
  observedAttributes: ['post-title'],
  itemText: readText,
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
    return null;
  },
  pageSubject(doc) {
    const match = /^\/r\/([^/]+)\/comments\/([a-z0-9]+)/i.exec(new URL(doc.location.href).pathname);
    if (!match) return null;
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
