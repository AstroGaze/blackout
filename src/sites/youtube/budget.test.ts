import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { protectionState, type ProtectionState } from '@/protection/state';
import type { SiteAdapter } from '@/sites/adapter';
import { renderPage, settle, viewPage } from '@/test/page';
import { gta6, stateWithTopics } from '@/test/state';
import { youtube } from './adapter';
import homeFeed from './fixtures/home-feed.html?raw';
import { homeFeedTile } from './fixtures/tile';
import watch from './fixtures/watch.html?raw';
import { viewItem, viewItems } from './fixtures/view';
import redditContentScript from '@/entrypoints/reddit.content';
import youtubeContentScript from '@/entrypoints/youtube.content';

const TILE = 'ytd-rich-item-renderer';

let guard: PageGuard | undefined;

beforeEach(() => {
  fakeBrowser.reset();
  history.replaceState(null, '', '/');
  document.body.replaceChildren();
});

afterEach(() => {
  guard?.stop();
  guard = undefined;
  vi.useRealTimers();
});

async function open(state: ProtectionState, adapter: SiteAdapter = youtube, html = homeFeed) {
  await protectionState.setValue(state);
  guard = startPageGuard(adapter);
  renderPage(html);
  await settle();
}

/** The YouTube adapter with `itemText` wrapped, to count or slow down reading items. */
function withItemText(wrap: (read: () => string) => string): SiteAdapter {
  return { ...youtube, itemText: (item) => wrap(() => youtube.itemText(item)) };
}

/** The YouTube adapter, taking `ms` to read each item, as on a very slow machine. */
const slowAdapter = (ms: number) =>
  withItemText((read) => {
    const until = performance.now() + ms;
    while (performance.now() < until) {
      // Busy, like a slow machine.
    }
    return read();
  });

/** A video that reports playing until something pauses it. */
function playingVideo(): HTMLVideoElement {
  const video = document.createElement('video');
  let playing = true;
  Object.defineProperty(video, 'paused', { get: () => !playing });
  video.pause = () => {
    playing = false;
  };
  video.play = async () => {
    playing = true;
  };
  return video;
}

/** Waits for the guard's current turn of checking, but not the ones after it. */
const oneTurn = () => new Promise((resolve) => setTimeout(resolve, 0));

const grid = () => document.querySelector('ytd-rich-grid-renderer #contents')!;

/** Fresh copies of the saved feed's tiles, as YouTube adds them while scrolling. */
function savedFeedTiles(): Element[] {
  const template = document.createElement('template');
  template.innerHTML = homeFeed.slice(homeFeed.search(/<body[\s>]/i), homeFeed.search(/<\/body>/i));
  return Array.from(template.content.querySelectorAll(TILE)).filter((tile) => !tile.parentElement?.closest(TILE));
}

describe('Checking that overruns its turn', () => {
  it('keeps items it has not reached yet hidden rather than showing them unchecked', async () => {
    await open(stateWithTopics(gta6()), slowAdapter(2));
    const added = savedFeedTiles();
    grid().append(...added);
    await oneTurn();

    const states = added.map((tile) => viewItem(tile).state);
    expect(states.filter((state) => state === 'withheld').length).toBeGreaterThan(added.length / 2);
    expect(states.filter((state) => state === 'shown').length).toBeLessThan(added.length / 4);
    await settle();
    expect(added.map((tile) => viewItem(tile).state).filter((state) => state === 'withheld')).toEqual([]);
  });

  it('hides shown items again, and pauses their videos, while their changed content waits for a check', async () => {
    await open(stateWithTopics(gta6()), slowAdapter(2));
    const shown = Array.from(document.querySelectorAll(TILE)).filter(
      (tile) => viewItem(tile).state === 'shown' && tile.querySelector('h3'),
    );
    expect(shown.length).toBeGreaterThan(20);
    const last = shown.at(-1)!;
    const video = playingVideo();
    last.append(video);
    await settle();

    // YouTube reuses the tiles for new videos, one of which is about GTA 6.
    for (const tile of shown) tile.querySelector('h3')!.textContent = 'Something new';
    last.querySelector('h3')!.textContent = 'GTA 6 ending explained';
    await oneTurn();

    expect(viewItem(last).state).toBe('withheld');
    expect(video.paused).toBe(true);
    await settle();
    expect(viewItem(last)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });
});

describe('Doing nothing when nothing needs protecting', () => {
  const nothingActive = () => {
    const off = { ...gta6(), enabled: false };
    return { ...stateWithTopics(off), blockedSources: [{ site: 'youtube' as const, account: '@rockstargames', name: 'Rockstar Games' }] };
  };

  it('hides nothing and checks nothing with no active topic', async () => {
    let reads = 0;
    const counting = withItemText((read) => {
      reads++;
      return read();
    });
    await open(nothingActive(), counting);
    grid().append(homeFeedTile('GTA 6 ending explained'));
    await settle();

    expect(viewItems(TILE).filter((view) => view.state !== 'shown')).toEqual([]);
    expect(reads).toBe(0);
  });

  it('leaves a watch page about a topic alone, its tab title too', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    history.replaceState(null, '', '/watch?v=VQRLujxTm3c');
    await protectionState.setValue(nothingActive());
    guard = startPageGuard(youtube);
    await settle();
    // YouTube shows the video's details after Blackout has read its state.
    renderPage(watch);
    await settle();
    // Long past the time a page that can't be checked gets covered.
    await vi.advanceTimersByTimeAsync(10_000);

    expect(viewPage()).toEqual({ title: 'Grand Theft Auto VI Trailer 2 - YouTube', state: 'shown' });
  });

  it('starts protecting open pages as soon as a topic is switched on, and stops when it is switched off', async () => {
    await open(nothingActive());
    const tile = homeFeedTile('GTA 6 ending explained');
    grid().append(tile);
    await settle();
    expect(viewItem(tile).state).toBe('shown');

    await protectionState.setValue(stateWithTopics(gta6()));
    await settle();
    expect(viewItem(tile)).toMatchObject({ state: 'covered', reason: 'GTA 6' });

    await protectionState.setValue(nothingActive());
    await settle();
    expect(viewItem(tile).state).toBe('shown');
  });

  it('lets videos play while idle, and pauses those in items not yet checked once a topic is switched on', async () => {
    await open(nothingActive(), slowAdapter(2));
    const video = playingVideo();
    const last = Array.from(document.querySelectorAll(TILE)).at(-1)!;
    last.append(video);
    await settle();
    video.dispatchEvent(new Event('play'));
    expect(video.paused).toBe(false);

    await protectionState.setValue(stateWithTopics(gta6()));
    await oneTurn();
    expect(viewItem(last).state).toBe('withheld');
    expect(video.paused).toBe(true);
  });

  it('runs no content script on sites it does not handle', () => {
    expect(youtubeContentScript.matches).toEqual(['*://www.youtube.com/*']);
    expect(redditContentScript.matches).toEqual(['*://www.reddit.com/*']);
    const contentScripts = Object.keys(
      import.meta.glob(['/src/entrypoints/*.content.*', '/src/entrypoints/*.content/**']),
    );
    expect(contentScripts).toEqual(['/src/entrypoints/reddit.content.ts', '/src/entrypoints/youtube.content.ts']);
  });
});
