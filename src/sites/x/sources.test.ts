// @vitest-environment-options {"happyDOM": {"url": "https://x.com/"}}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { BLOCK_MENU_ENTRIES, blockSourceUnderPointer, listenForSourceRequests } from '@/protection/blocked-sources';
import { protectionState, type BlockedSource } from '@/protection/state';
import { listenForHiddenItems, suggestedBlockCounts } from '@/protection/suggested-blocks';
import { clickCoverButton, clickPageCoverButton, renderPage, settle, viewToast } from '@/test/page';
import { gta6, stateWithTopics, topic } from '@/test/state';
import { x } from './adapter';
import homeTimeline from './fixtures/home-timeline.html?raw';
import post from './fixtures/post.html?raw';
import searchResults from './fixtures/search-results.html?raw';
import { xPost } from './fixtures/post';
import { viewItem } from './fixtures/view';

const severance = () => topic('Severance', { strong: ['Lumon'] });
const huskirl: BlockedSource = { site: 'x', account: '@huskirl', name: '@huskirl' };

/** The background's answer to a message, from whichever listener gives one. */
async function answerFromPage(message: unknown) {
  const answers = await fakeBrowser.runtime.onMessage.trigger(message, {}, () => {});
  return Promise.all(answers).then((settled) => settled.find((answer) => answer !== undefined));
}

let guard: PageGuard | undefined;
const stops: (() => void)[] = [];

beforeEach(() => {
  fakeBrowser.reset();
  document.body.replaceChildren();
  stops.push(listenForSourceRequests(), listenForHiddenItems());
});

afterEach(() => {
  guard?.stop();
  guard = undefined;
  for (const stop of stops.splice(0)) stop();
});

async function open(html: string, path: string) {
  guard?.stop();
  history.replaceState(null, '', path);
  guard = startPageGuard(x);
  renderPage(html);
  await settle();
  // Hidden Items are counted in the background, which then offers a Suggested Block.
  await settle();
}

const blockedSources = async () => (await protectionState.getValue()).blockedSources;
const timeline = () => document.querySelector('[data-testid="cellInnerDiv"]')!.parentElement!;

describe('Blocked Sources on X', () => {
  it('hides every post from a blocked account, whatever it says', async () => {
    await protectionState.setValue({ ...stateWithTopics(severance()), blockedSources: [huskirl] });
    await open(homeTimeline, '/home');

    const husk = Array.from(document.querySelectorAll('article')).find((article) => article.querySelector('a[href="/huskirl"]'))!;
    expect(viewItem(husk)).toMatchObject({ state: 'covered', reason: 'Blocked Source' });
  });

  it('hides what a blocked account reposts or quotes, not only what it writes', async () => {
    await protectionState.setValue({ ...stateWithTopics(severance()), blockedSources: [huskirl] });
    await open(homeTimeline, '/home');
    const reposted = xPost('A nice photo', { reposter: 'huskirl' });
    const quoting = xPost('Look at this', { quoted: { text: 'Weather today', author: 'huskirl' } });
    const mentioning = xPost('Thanks @huskirl for the tip');
    mentioning.querySelector('[data-testid="tweetText"] span')!.innerHTML = 'Thanks <a href="/huskirl">@huskirl</a> for the tip';
    timeline().append(reposted, quoting, mentioning);
    await settle();

    expect([reposted, quoting].map((item) => viewItem(item))).toEqual([
      expect.objectContaining({ reason: 'Blocked Source' }),
      expect.objectContaining({ reason: 'Blocked Source' }),
    ]);
    // Mentioning an account doesn't make a post come from it.
    expect(viewItem(mentioning).state).toBe('shown');
  });

  it('blocks a hidden post’s author from its cover, not whoever reposted it', async () => {
    await protectionState.setValue(stateWithTopics(gta6()));
    await open(homeTimeline, '/home');
    const reposted = xPost('Leonida map leaked', { author: 'GTALeaks', reposter: 'friend' });
    timeline().append(reposted);
    await settle();

    clickCoverButton(reposted, 'Block source');
    await settle();

    expect(await blockedSources()).toEqual([{ site: 'x', account: '@gtaleaks', name: '@GTALeaks' }]);
  });

  it('blocks an account from the right-click menu', async () => {
    await protectionState.setValue(stateWithTopics(severance()));
    vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockImplementation(async (_tabId, message) => answerFromPage(message));
    await open(homeTimeline, '/home');
    const entry = BLOCK_MENU_ENTRIES.find((candidate) => (candidate.sites as readonly string[]).includes('*://x.com/*'));
    expect(entry?.title).toBe('Block this account');

    const husk = Array.from(document.querySelectorAll('article')).find((article) => article.querySelector('a[href="/huskirl"]'))!;
    husk.querySelector('[data-testid="tweetText"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await blockSourceUnderPointer(1, 0, entry!.accountPrefix);

    expect(await blockedSources()).toEqual([huskirl]);
  });

  it('suggests blocking an account after 3 of its posts are hidden for a topic in a day', async () => {
    await protectionState.setValue(stateWithTopics(gta6()));
    // DiscussingFilm posted three of the results for "gta 6".
    await open(searchResults, '/search');

    expect(viewToast()).toEqual({
      title: 'Block @DiscussingFilm?',
      text: 'Blackout hid 3 of its GTA 6 items today.',
      buttons: ['Not now', 'Block account'],
    });
    expect(await blockedSources()).toEqual([]);
  });

  it('counts a post covered as a page once, towards its author', async () => {
    await protectionState.setValue(stateWithTopics(gta6()));
    await open(post, '/RockstarGames/status/2110717537964953810');
    clickPageCoverButton('Continue to page');
    await settle();
    clickPageCoverButton('Continue');
    await settle();

    const tallies = Object.values((await suggestedBlockCounts.getValue()).tallies);
    expect(tallies.find((tally) => tally.source.account === '@rockstargames')?.itemKeys).toEqual(['status/2110717537964953810']);
  });
});
