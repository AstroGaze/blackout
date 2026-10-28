import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { blockSourceUnderPointer, listenForSourceRequests } from '@/protection/blocked-sources';
import { protectionState, type BlockedSource } from '@/protection/state';
import { pauseTopic, setTopicEnabled } from '@/protection/topics';
import { clickCoverButton, clickPageCoverButton, renderPage, settle, viewPage } from '@/test/page';
import { gta6, stateWithTopics, topic } from '@/test/state';
import { youtube } from './adapter';
import homeFeed from './fixtures/home-feed.html?raw';
import shortsPage from './fixtures/shorts.html?raw';
import gtaWatchPage from './fixtures/watch.html?raw';
import otherWatchPage from './fixtures/watch-other.html?raw';
import { viewItem, viewItems, youtubeTitle } from './fixtures/view';

const TILE = 'ytd-rich-item-renderer';
const COMMENT = 'ytd-comment-view-model';
const severance = () => topic('Severance', { strong: ['Lumon'] });
const rockstar: BlockedSource = { site: 'youtube', account: '@rockstargames', name: 'Rockstar Games' };

/** What the page answers a message from the background with: its first listener that answers. */
async function answerFromPage(message: unknown) {
  const answers = await fakeBrowser.runtime.onMessage.trigger(message, {}, () => {});
  return Promise.all(answers).then((settled) => settled.find((answer) => answer !== undefined));
}

let guard: PageGuard | undefined;
let stopListening: (() => void) | undefined;

beforeEach(() => {
  fakeBrowser.reset();
  document.title = '';
  document.body.replaceChildren();
  history.replaceState(null, '', '/');
  // The background, which stores blocks asked for from the page.
  stopListening = listenForSourceRequests();
});

afterEach(() => {
  guard?.stop();
  guard = undefined;
  stopListening?.();
});

async function open(html: string, path = '/') {
  guard?.stop();
  history.replaceState(null, '', path);
  guard = startPageGuard(youtube);
  renderPage(html);
  await settle();
}

const tileTitled = (start: string) =>
  [...document.querySelectorAll(TILE)].find((tile) => youtubeTitle(tile).startsWith(start))!;
const commentStarting = (start: string) =>
  [...document.querySelectorAll(COMMENT)].find((comment) => youtubeTitle(comment).startsWith(start))!;
const blockedSources = async () => (await protectionState.getValue()).blockedSources;

describe('a Blocked Source on YouTube', () => {
  it('hides every tile from the channel, whatever its title says, labelled "Blocked Source"', async () => {
    await protectionState.setValue({ ...stateWithTopics(severance()), blockedSources: [rockstar] });

    await open(homeFeed);

    expect([
      viewItem(tileTitled('Grand Theft Auto VI Trailer 2')),
      viewItem(tileTitled('GTA Online: A Safehouse in the Hills')),
    ]).toEqual([
      { title: 'Grand Theft Auto VI Trailer 2', state: 'covered', reason: 'Blocked Source' },
      { title: expect.stringMatching(/^GTA Online/), state: 'covered', reason: 'Blocked Source' },
    ]);
    // Another channel, even one with a similar name, is unaffected.
    expect(viewItem(tileTitled('Tráiler de lanzamiento de Grand Theft Auto VI'))).toMatchObject({ state: 'shown' });
    expect(viewItems(TILE).filter((view) => view.state === 'covered')).toHaveLength(2);
  });

  it('hides a blocked commenter’s comments', async () => {
    await protectionState.setValue({
      ...stateWithTopics(severance()),
      blockedSources: [{ site: 'youtube', account: '@stopitpls', name: '@Stopitpls' }],
    });

    await open(otherWatchPage, '/watch?v=gmA6MrX81z4');

    expect(viewItem(commentStarting('Almost two years ago?'))).toMatchObject({ state: 'covered', reason: 'Blocked Source' });
    expect(viewItem(commentStarting('9 years ago now'))).toMatchObject({ state: 'shown' });
  });

  it('covers a watch page whose video comes from a Blocked Source', async () => {
    await protectionState.setValue({ ...stateWithTopics(severance()), blockedSources: [rockstar] });

    await open(otherWatchPage, '/watch?v=gmA6MrX81z4');

    expect(viewPage()).toMatchObject({ state: 'covered', reason: 'Blocked Source' });
  });

  it('applies only while at least one topic is active', async () => {
    await protectionState.setValue({ ...stateWithTopics(), blockedSources: [rockstar] });

    await open(homeFeed);

    expect(viewItem(tileTitled('GTA Online: A Safehouse in the Hills'))).toMatchObject({ state: 'shown' });
  });

  it('doesn’t apply while every topic is paused or switched off', async () => {
    let state = stateWithTopics(gta6(), severance());
    state = pauseTopic(state, 'gta-6', Date.now() + 60 * 60 * 1000);
    state = setTopicEnabled(state, 'severance', false);
    await protectionState.setValue({ ...state, blockedSources: [rockstar] });

    await open(homeFeed);

    expect(viewItem(tileTitled('GTA Online: A Safehouse in the Hills'))).toMatchObject({ state: 'shown' });
  });

  it('labels an item that also matches a topic as from a Blocked Source', async () => {
    await protectionState.setValue({ ...stateWithTopics(gta6()), blockedSources: [rockstar] });

    await open(homeFeed);

    expect(viewItem(tileTitled('Grand Theft Auto VI Trailer 2'))).toMatchObject({ state: 'covered', reason: 'Blocked Source' });
  });

  it('credits a watch page’s description to the video’s channel, not a channel it links to', async () => {
    // The description links the game's own channel.
    const gameChannel: BlockedSource = { site: 'youtube', account: 'UCrRwHVnmTVXQOv_lLeef3qg', name: 'Red Dead Redemption 2' };
    await protectionState.setValue({ ...stateWithTopics(severance()), blockedSources: [gameChannel] });

    await open(otherWatchPage, '/watch?v=gmA6MrX81z4');

    expect(viewItem(document.querySelector('#description-inner')!)).toMatchObject({ state: 'shown' });
  });
});

describe('blocking a source from the page', () => {
  it('blocks a Hidden Item’s channel from its cover, hiding the channel’s other tiles too', async () => {
    await protectionState.setValue(stateWithTopics(gta6()));
    await open(homeFeed);
    const trailer = tileTitled('Grand Theft Auto VI Trailer 2');
    expect(viewItem(trailer)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
    expect(viewItem(tileTitled('GTA Online: A Safehouse in the Hills'))).toMatchObject({ state: 'shown' });

    clickCoverButton(trailer, 'Block source');
    await vi.waitFor(async () => expect(await blockedSources()).toHaveLength(1));
    await settle();

    expect(await blockedSources()).toEqual([rockstar]);
    expect(viewItem(tileTitled('GTA Online: A Safehouse in the Hills'))).toMatchObject({
      state: 'covered',
      reason: 'Blocked Source',
    });
  });

  it('unblocks a source from its cover, showing what no topic hides', async () => {
    await protectionState.setValue({ ...stateWithTopics(gta6()), blockedSources: [rockstar] });
    await open(homeFeed);
    const online = tileTitled('GTA Online: A Safehouse in the Hills');

    clickCoverButton(online, 'Unblock');
    await vi.waitFor(async () => expect(await blockedSources()).toEqual([]));
    await settle();

    expect(viewItem(online)).toMatchObject({ state: 'shown' });
    expect(viewItem(tileTitled('Grand Theft Auto VI Trailer 2'))).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('blocks the channel of a tile, Short or comment chosen from the right-click menu', async () => {
    await protectionState.setValue(stateWithTopics(severance()));
    // The background asks the tab which source is under the pointer.
    vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockImplementation(
      async (_tabId, message) => answerFromPage(message),
    );

    await open(homeFeed);
    tileTitled('Eat Everything In A Grocery Store').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await blockSourceUnderPointer(1, 0);
    await open(shortsPage, '/shorts/x');
    document.querySelector('ytd-reel-video-renderer')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await blockSourceUnderPointer(1, 0);
    await open(otherWatchPage, '/watch?v=gmA6MrX81z4');
    commentStarting('9 years ago now').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await blockSourceUnderPointer(1, 0);

    expect((await blockedSources()).map((source) => source.account)).toEqual(['@mrbeast', '@driftyonline', '@ok9054']);
    expect(viewItem(commentStarting('9 years ago now'))).toMatchObject({ state: 'covered', reason: 'Blocked Source' });
  });

  it('blocks the channel of a Hidden Item right-clicked on its cover', async () => {
    await protectionState.setValue(stateWithTopics(gta6()));
    vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockImplementation(async (_tabId, message) => answerFromPage(message));
    await open(homeFeed);
    const trailer = tileTitled('Grand Theft Auto VI Trailer 2');

    trailer.querySelector('blackout-cover')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, composed: true }));
    await blockSourceUnderPointer(1, 0);

    expect(await blockedSources()).toEqual([rockstar]);
  });

  it('does nothing when what was right-clicked has no channel', async () => {
    await protectionState.setValue(stateWithTopics(severance()));
    vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockImplementation(
      async (_tabId, message) => answerFromPage(message),
    );
    await open(homeFeed);

    document.body.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await blockSourceUnderPointer(1, 0);

    expect(await blockedSources()).toEqual([]);
  });
});

describe('blocking the channel of the video being watched', () => {
  it('blocks it from a page covered for a topic', async () => {
    await protectionState.setValue(stateWithTopics(gta6()));
    await open(gtaWatchPage, '/watch?v=VQRLujxTm3c');
    expect(viewPage()).toMatchObject({ state: 'covered', reason: 'GTA 6' });

    clickPageCoverButton('Block source');
    await vi.waitFor(async () => expect(await blockedSources()).toEqual([rockstar]));
    await settle();

    expect(viewPage()).toMatchObject({ state: 'covered', reason: 'Blocked Source' });
  });

  it('blocks it by right-clicking the channel’s name under the video', async () => {
    await protectionState.setValue(stateWithTopics(severance()));
    vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockImplementation(async (_tabId, message) => answerFromPage(message));
    await open(otherWatchPage, '/watch?v=gmA6MrX81z4');

    document.querySelector('ytd-watch-metadata #owner ytd-channel-name a')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await blockSourceUnderPointer(1, 0);

    expect(await blockedSources()).toEqual([rockstar]);
  });
});

describe('a watch page from a Blocked Source', () => {
  it('offers to unblock the channel from the page cover', async () => {
    await protectionState.setValue({ ...stateWithTopics(severance()), blockedSources: [rockstar, { ...rockstar, account: '@other' }] });
    await open(otherWatchPage, '/watch?v=gmA6MrX81z4');

    clickPageCoverButton('Unblock');
    await vi.waitFor(async () => expect(await blockedSources()).toEqual([{ ...rockstar, account: '@other' }]));
    await settle();

    expect(viewPage()).toMatchObject({ state: 'shown' });
  });

});
