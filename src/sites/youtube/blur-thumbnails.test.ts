import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { initialProtectionState, protectionState } from '@/protection/state';
import { isBlurred, renderPage, settle } from '@/test/page';
import { gta6, stateWithTopics } from '@/test/state';
import { youtube } from './adapter';
import homeFeed from './fixtures/home-feed.html?raw';
import notifications from './fixtures/notifications.html?raw';
import search from './fixtures/search.html?raw';
import shorts from './fixtures/shorts.html?raw';
import watch from './fixtures/watch.html?raw';
import { viewItem } from './fixtures/view';

let guard: PageGuard | undefined;

beforeEach(() => {
  fakeBrowser.reset();
  history.replaceState(null, '', '/');
  document.body.replaceChildren();
});

afterEach(() => {
  guard?.stop();
  guard = undefined;
});

async function setBlurAll(on: boolean) {
  await protectionState.setValue({ ...(await protectionState.getValue()), blurAllThumbnails: on });
  await settle();
}

async function open(html: string, { blurAll }: { blurAll: boolean }) {
  await protectionState.setValue({ ...stateWithTopics(gta6()), blurAllThumbnails: blurAll });
  guard = startPageGuard(youtube);
  renderPage(html);
  await settle();
}

const all = (selector: string) => Array.from(document.querySelectorAll(selector));

/** The pictures of tiles that passed their check, which nothing else blurs. */
const shownTilePictures = (tile: string, picture: string) =>
  all(tile)
    .filter((item) => viewItem(item).state === 'shown')
    .flatMap((item) => Array.from(item.querySelectorAll(picture)));

const CHANNEL_TRAILER_ENDED = `<body>
<ytd-channel-video-player-renderer><ytd-player><div id="movie_player">
  <video></video>
  <a class="ytp-modern-videowall-still" href="/watch?v=gta6">
    <div class="ytp-modern-videowall-still-image"></div>
    <span class="ytp-modern-videowall-still-info-title">Grand Theft Auto VI Trailer 2</span>
  </a>
  <div class="ytp-autonav-endscreen-upnext-thumbnail"></div>
</div></ytd-player></ytd-channel-video-player-renderer>
</body>`;

/**
 * Fills YouTube's shared preview player the way hovering a tile does: with the
 * tile's link, a title and a playing video, laid over the tile.
 */
async function hoverPreview(tile: Element, title: string): Promise<Element> {
  tile.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  const href = tile.querySelector('a[href*="/watch"]')!.getAttribute('href')!;
  const preview = document.querySelector('ytd-video-preview')!;
  const link = document.createElement('a');
  link.setAttribute('href', href);
  link.append(document.createElement('video'));
  const heading = document.createElement('h3');
  heading.textContent = title;
  preview.replaceChildren(link, heading);
  await settle();
  return preview;
}

describe('Blur all YouTube thumbnails', () => {
  it('is off by default', async () => {
    expect(initialProtectionState().blurAllThumbnails).toBe(false);
    await open(homeFeed, { blurAll: false });

    const pictures = shownTilePictures('ytd-rich-item-renderer', 'yt-thumbnail-view-model');
    expect(pictures.length).toBeGreaterThan(10);
    expect(pictures.filter(isBlurred)).toEqual([]);
  });

  it.each([
    ['home feed videos and Shorts', homeFeed, ['yt-thumbnail-view-model']],
    [
      "search results, their chapters' frames, Shorts and the watch card beside them",
      search,
      [
        'ytd-thumbnail',
        'ytd-macro-markers-list-item-renderer img',
        'yt-thumbnail-view-model',
        'ytd-watch-card-hero-video-renderer #hero-image img',
      ],
    ],
    [
      "recommendations, the end screen and the player's still",
      watch,
      ['yt-thumbnail-view-model', '.ytp-modern-videowall-still-image', '.ytp-cued-thumbnail-overlay-image'],
    ],
    ['the Shorts player queue', shorts, ['.reel-video-in-sequence-thumbnail']],
    ['notifications', notifications, ['ytd-notification-renderer .thumbnail-container']],
  ])('blurs every thumbnail when on: %s', async (_name, html, selectors) => {
    await open(html, { blurAll: true });

    for (const selector of selectors) {
      const pictures = all(selector);
      expect(pictures.length, selector).toBeGreaterThan(0);
      expect(pictures.filter((picture) => !isBlurred(picture)), selector).toEqual([]);
    }
  });

  it('blurs thumbnails from first paint, before the setting has been read', () => {
    guard = startPageGuard(youtube);
    renderPage(watch);

    // The player's still sits outside any checked item, so nothing else hides it meanwhile.
    const still = document.querySelector('.ytp-cued-thumbnail-overlay-image')!;
    expect(isBlurred(still)).toBe(true);
  });

  it('keeps a thumbnail blurred while it is hovered or clicked', async () => {
    await open(homeFeed, { blurAll: true });
    const [picture] = shownTilePictures('ytd-rich-item-renderer', 'yt-thumbnail-view-model');
    // The page would open the video; the test stays put.
    picture!.closest('a')?.addEventListener('click', (event) => event.preventDefault());

    picture!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    picture!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();

    expect(isBlurred(picture!)).toBe(true);
  });

  it("blurs the video a hovered tile previews, but not the preview's cover label", async () => {
    await open(homeFeed, { blurAll: true });
    const [shownTile] = all('ytd-rich-item-renderer').filter(
      (item) => viewItem(item).state === 'shown' && item.querySelector('a[href*="/watch"]'),
    );
    const [coveredTile] = all('ytd-rich-item-renderer').filter((item) => viewItem(item).state === 'covered');

    const preview = await hoverPreview(shownTile!, 'A tile about something else');
    expect(viewItem(preview).state).toBe('shown');
    expect(isBlurred(preview.querySelector('video')!)).toBe(true);

    await hoverPreview(coveredTile!, 'Grand Theft Auto VI Trailer 2');
    expect(viewItem(preview)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
    expect(isBlurred(preview.querySelector('blackout-cover')!)).toBe(false);
  });

  it("blurs the video a channel's home page plays by itself, and the picture of what plays next", async () => {
    // A channel trailer that has ended: its end screen suggests a GTA 6 video, and autoplay counts down to the next.
    await open(CHANNEL_TRAILER_ENDED, { blurAll: true });

    expect(isBlurred(document.querySelector('ytd-channel-video-player-renderer video')!)).toBe(true);
    expect(isBlurred(document.querySelector('.ytp-autonav-endscreen-upnext-thumbnail')!)).toBe(true);
    const suggestion = document.querySelector('.ytp-modern-videowall-still')!;
    expect(viewItem(suggestion)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
    expect(isBlurred(suggestion.querySelector('blackout-cover')!)).toBe(false);
  });

  it('un-blurs thumbnails on open pages as soon as it is turned off, and blurs them again when turned on', async () => {
    await open(search, { blurAll: true });
    const pictures = shownTilePictures('ytd-video-renderer', 'ytd-thumbnail');
    expect(pictures.length).toBeGreaterThan(5);

    await setBlurAll(false);
    expect(pictures.filter(isBlurred)).toEqual([]);

    await setBlurAll(true);
    expect(pictures.filter((picture) => !isBlurred(picture))).toEqual([]);
  });
});
