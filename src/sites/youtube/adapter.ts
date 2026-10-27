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
    // A watch page's own description.
    inline('#description-inner'),
  ],
  // YouTube marks the watch page metadata with its video once it has loaded.
  observedAttributes: ['video-id'],
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
    return { key, text: `${titleText} ${channel ? readText(channel) : ''}` };
  },
};
