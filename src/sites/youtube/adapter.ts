import type { BlockedSource } from '@/protection/state';
import { readText, type ItemKind, type SiteAdapter } from '../adapter';
import { skipCoveredSuggestions } from './suggestion-keys';

const card = (selector: string): ItemKind => ({ selector, cover: 'card' });
const inline = (selector: string): ItemKind => ({ selector, cover: 'inline' });

/**
 * The channel an element shows, from its first link to a channel: a handle such
 * as "/@RockstarGames", or a channel id. Tiles and comments link their channel
 * or author before anything else.
 */
function channelOf(element: Element): BlockedSource | null {
  for (const link of [element, ...element.querySelectorAll('a[href]')]) {
    const account = channelAccount(link.getAttribute('href'));
    if (!account) continue;
    const name = readText(link).replace(/\s+/g, ' ').trim();
    return { site: 'youtube', account, name: name || account };
  }
  return null;
}

/** The channel a link points to, or null when it points elsewhere or can't be read. */
function channelAccount(href: string | null): string | null {
  if (!href) return null;
  try {
    const [first, second] = new URL(href, 'https://www.youtube.com').pathname.split('/').filter(Boolean);
    if (first?.startsWith('@')) return decodeURIComponent(first).toLowerCase();
    if (first === 'channel' && second) return decodeURIComponent(second);
  } catch {
    // A malformed link names no channel.
  }
  return null;
}

/** The channel of the video a watch page shows, from its name under the video. */
function watchPageChannel(doc: Document): BlockedSource | null {
  const owner = doc.querySelector('ytd-watch-metadata #owner');
  const name = owner?.querySelector('ytd-channel-name');
  return (name && channelOf(name)) ?? (owner && channelOf(owner));
}

export const youtube: SiteAdapter = {
  site: 'youtube',
  itemKinds: [
    // Home feed tiles: videos, Shorts and in-feed ads.
    card('ytd-rich-item-renderer'),
    // Search results.
    card('ytd-video-renderer'),
    card('ytd-channel-renderer'),
    card('ytd-playlist-renderer'),
    card('ytd-radio-renderer'),
    card('ytd-universal-watch-card-renderer'),
    // Recommendations beside a video, and playlists or mixes in search.
    card('yt-lockup-view-model'),
    card('ytd-compact-video-renderer'),
    // Suggestions on the player's end screen.
    card('.ytp-modern-videowall-still'),
    // Shorts in a shelf, and the Shorts player.
    card('ytm-shorts-lockup-view-model'),
    card('ytd-reel-video-renderer'),
    // Search suggestions under the search box.
    inline('.ytSuggestionComponentSuggestion'),
    // Comments and replies alike.
    inline('ytd-comment-view-model'),
    inline('yt-live-chat-text-message-renderer'),
    inline('yt-live-chat-paid-message-renderer'),
    inline('yt-live-chat-membership-item-renderer'),
    // Pinned messages.
    inline('yt-live-chat-banner-renderer'),
    inline('ytd-notification-renderer'),
    // A watch page's own description.
    inline('#description-inner'),
    // The player YouTube lays over a tile or Short while hovering it.
    { selector: 'ytd-video-preview', cover: 'card', mirrors: true },
  ],
  // YouTube marks the watch page metadata with its video once it has loaded.
  observedAttributes: ['video-id'],
  protectInteractions: skipCoveredSuggestions,
  itemText: readText,
  itemSource(item) {
    // A video's description links other channels, such as its game's; it belongs to the video's own.
    if (item.matches('#description-inner')) return watchPageChannel(item.ownerDocument);
    return channelOf(item);
  },
  itemKey(item) {
    // Links may be relative or absolute, and an item can be a link itself.
    const url = [item, ...item.querySelectorAll('a[href]')]
      .map((link) => link.getAttribute('href'))
      .filter((href) => href !== null)
      .map((href) => new URL(href, 'https://www.youtube.com'))
      .find(({ pathname }) => pathname === '/watch' || pathname.startsWith('/shorts/'));
    if (!url) return null;
    if (url.pathname !== '/watch') return url.pathname;
    // Ignore tracking parameters, which YouTube can change on the same video.
    // A comment links to its video with its own id in "lc".
    const comment = url.searchParams.get('lc');
    return `watch:${url.searchParams.get('v')}${comment ? `:${comment}` : ''}`;
  },
  pageSubject(doc) {
    const url = new URL(doc.location.href);
    const videoId = url.searchParams.get('v');
    if (url.pathname !== '/watch' || !videoId || !/^[\w-]+$/.test(videoId)) return null;
    const key = `watch:${videoId}`;
    // After navigating inside YouTube, the metadata shows the previous video until
    // it updates, so only trust metadata marked with this video's id.
    const metadata = doc.querySelector(`ytd-watch-metadata[video-id="${videoId}"]`);
    const title = metadata?.querySelector('#title h1');
    const titleText = title ? readText(title).trim() : '';
    if (!metadata || titleText === '') return { key, text: null };
    const channel = metadata.querySelector('#owner ytd-channel-name');
    return { key, text: `${titleText} ${channel ? readText(channel) : ''}`, source: watchPageChannel(doc) };
  },
};
