import { readText, type SiteAdapter } from '../adapter';

export const youtube: SiteAdapter = {
  site: 'youtube',
  itemSelectors: [
    // Home feed tiles: videos, Shorts and in-feed ads.
    'ytd-rich-item-renderer',
  ],
  itemText: readText,
  itemKey(item) {
    const href = item
      .querySelector('a[href^="/watch?"], a[href^="/shorts/"]')
      ?.getAttribute('href');
    if (!href) return null;
    const url = new URL(href, 'https://www.youtube.com');
    // Ignore tracking parameters, which YouTube can change on the same video.
    return url.pathname === '/watch' ? `watch:${url.searchParams.get('v')}` : url.pathname;
  },
};
