import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { listenForSourceRequests, requestUnblock } from '@/protection/blocked-sources';
import { protectionState } from '@/protection/state';
import { dayOf, listenForHiddenItems, suggestedBlockCounts } from '@/protection/suggested-blocks';
import { clickPageCoverButton, clickToastButton, renderPage, settle, viewToast } from '@/test/page';
import { gta6, stateWithTopics, topic } from '@/test/state';
import { youtube } from './adapter';
import homeFeed from './fixtures/home-feed.html?raw';
import searchPage from './fixtures/search.html?raw';
import gtaWatchPage from './fixtures/watch.html?raw';
import { coveredTitles, viewItems } from './fixtures/view';

const RESULT = 'ytd-video-renderer';
const DAY = 24 * 60 * 60 * 1000;

let guard: PageGuard | undefined;
const stops: (() => void)[] = [];

beforeEach(async () => {
  fakeBrowser.reset();
  document.body.replaceChildren();
  // The background, which counts Hidden Items and stores blocks.
  stops.push(listenForHiddenItems(), listenForSourceRequests());
  await protectionState.setValue(stateWithTopics(gta6()));
});

afterEach(() => {
  guard?.stop();
  guard = undefined;
  for (const stop of stops.splice(0)) stop();
  vi.useRealTimers();
});

/** Opens a page and waits until its Hidden Items have been counted. */
async function open(html: string, path = '/') {
  guard?.stop();
  history.replaceState(null, '', path);
  guard = startPageGuard(youtube);
  renderPage(html);
  await settle();
  await settle();
}

const blockedSources = async () => (await protectionState.getValue()).blockedSources;

describe('Suggested Blocks', () => {
  it('suggests blocking a channel once 3 of its items are hidden for a topic in a day, blocking nothing by itself', async () => {
    // Three of the results come from Rockstar Games and name GTA 6.
    await open(searchPage, '/results?search_query=gta');

    expect(viewToast()).toEqual({
      title: 'Block Rockstar Games?',
      text: 'Blackout hid 3 of its GTA 6 items today.',
      buttons: ['Not now', 'Block channel'],
    });
    expect(await blockedSources()).toEqual([]);
    expect(viewItems(RESULT).filter((view) => view.state === 'covered' && view.reason === 'Blocked Source')).toEqual([]);
  });

  it('suggests nothing below 3', async () => {
    // Rockstar Games has one GTA 6 tile here, and no other channel more.
    await open(homeFeed);

    expect(viewToast()).toBeNull();
  });

  it('counts each Hidden Item once, however often it is seen', async () => {
    await open(homeFeed);
    await open(homeFeed);
    await open(homeFeed);

    expect(viewToast()).toBeNull();
  });

  it('counts items seen on different pages the same day', async () => {
    // The home feed's Rockstar trailer is one of the three in the search results.
    await open(homeFeed);
    expect(viewToast()).toBeNull();

    await open(searchPage, '/results?search_query=gta');

    expect(viewToast()).toMatchObject({ text: 'Blackout hid 3 of its GTA 6 items today.' });
  });

  it('blocks the channel with one click', async () => {
    await open(searchPage, '/results?search_query=gta');

    clickToastButton('Block channel');
    await vi.waitFor(async () => expect(await blockedSources()).toHaveLength(1));
    await settle();

    expect(await blockedSources()).toEqual([{ site: 'youtube', account: '@rockstargames', name: 'Rockstar Games' }]);
    expect(viewToast()).toBeNull();
    expect(viewItems(RESULT).filter((view) => view.state === 'covered' && view.reason === 'Blocked Source')).toHaveLength(3);
  });

  it('stops suggesting it for the rest of the day when dismissed, and starts counting again the next day', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-19T10:00:00'), toFake: ['Date'] });
    await open(searchPage, '/results?search_query=gta');

    clickToastButton('Not now');
    await settle();
    await settle();
    expect(viewToast()).toBeNull();
    await open(searchPage, '/results?search_query=gta');
    expect(viewToast()).toBeNull();
    expect(await blockedSources()).toEqual([]);

    vi.setSystemTime(Date.now() + DAY);
    await open(searchPage, '/results?search_query=gta');

    expect(viewToast()).toMatchObject({ title: 'Block Rockstar Games?' });
  });

  it('silences the channel for every topic when dismissed', async () => {
    // Rockstar's results name GTA 6, and all say "Trailer" too.
    await protectionState.setValue(stateWithTopics(gta6(), topic('Trailers', { strong: ['Trailer'] })));
    await open(searchPage, '/results?search_query=gta');
    expect(viewToast()).toMatchObject({ title: 'Block Rockstar Games?' });

    clickToastButton('Not now');
    await settle();
    await settle();

    expect(viewToast()).toBeNull();
  });

  it('doesn’t suggest a channel again after it was blocked and then unblocked the same day', async () => {
    await open(searchPage, '/results?search_query=gta');
    clickToastButton('Block channel');
    await vi.waitFor(async () => expect(await blockedSources()).toHaveLength(1));
    await settle();

    await requestUnblock({ site: 'youtube', account: '@rockstargames', name: 'Rockstar Games' });
    await vi.waitFor(async () => expect(await blockedSources()).toHaveLength(0));
    await settle();
    await settle();

    expect(viewToast()).toBeNull();
  });

  it('counts a watch page covered for a topic as one of its channel’s Hidden Items', async () => {
    // Two other Rockstar videos were hidden earlier today.
    await suggestedBlockCounts.setValue({
      day: dayOf(),
      tallies: {
        'youtube @rockstargames gta-6': {
          source: { site: 'youtube', account: '@rockstargames', name: 'Rockstar Games' },
          topicId: 'gta-6',
          topicName: 'GTA 6',
          itemKeys: ['watch:one', 'watch:two'],
          dismissed: false,
        },
      },
    });

    await open(gtaWatchPage, '/watch?v=VQRLujxTm3c');
    clickPageCoverButton('Continue to page');
    await settle();
    clickPageCoverButton('Continue');
    await settle();

    expect(viewToast()).toMatchObject({ text: 'Blackout hid 3 of its GTA 6 items today.' });
  });

  it('doesn’t count items hidden because their source is already blocked', async () => {
    await protectionState.setValue({
      ...stateWithTopics(gta6()),
      blockedSources: [{ site: 'youtube', account: '@rockstargames', name: 'Rockstar Games' }],
    });

    await open(searchPage, '/results?search_query=gta');

    expect(coveredTitles(RESULT).length).toBeGreaterThan(0);
    expect(viewToast()).toBeNull();
  });
});
