import { readText, type ItemKind, type SiteAdapter } from '../adapter';

const card = (selector: string): ItemKind => ({ selector, cover: 'card' });
const inline = (selector: string): ItemKind => ({ selector, cover: 'inline' });

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
  ],
  itemText: readText,
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
};
