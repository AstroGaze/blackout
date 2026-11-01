// @vitest-environment-options {"happyDOM": {"url": "https://www.reddit.com/"}}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { BLOCK_MENU_ENTRIES, blockSourceUnderPointer, listenForSourceRequests } from '@/protection/blocked-sources';
import { protectionState, type BlockedSource } from '@/protection/state';
import { listenForHiddenItems, suggestedBlockCounts } from '@/protection/suggested-blocks';
import { clickCoverButton, clickPageCoverButton, renderPage, settle, viewToast } from '@/test/page';
import { gta6, stateWithTopics, topic } from '@/test/state';
import { reddit } from './adapter';
import homeFeed from './fixtures/home-feed.html?raw';
import { redditComment, redditPost } from './fixtures/post';
import subreddit from './fixtures/subreddit.html?raw';
import thread from './fixtures/thread.html?raw';
import { viewItem } from './fixtures/view';

const POST = 'shreddit-post';
const askReddit: BlockedSource = { site: 'reddit', account: 'r/askreddit', name: 'r/AskReddit' };
const severance = () => topic('Severance', { strong: ['Lumon'] });

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
  guard = startPageGuard(reddit);
  renderPage(html);
  await settle();
  await settle();
}

const blockedSources = async () => (await protectionState.getValue()).blockedSources;
const postTitled = (title: string) =>
  Array.from(document.querySelectorAll(POST)).find((post) => post.getAttribute('post-title') === title)!;

describe('Blocked Sources on Reddit', () => {
  it('hides every post from a blocked subreddit, whatever it says', async () => {
    await protectionState.setValue({ ...stateWithTopics(severance()), blockedSources: [askReddit] });
    await open(homeFeed, '/');

    expect(
      Array.from(document.querySelectorAll(POST))
        .filter((post) => viewItem(post).state === 'covered')
        .map((post) => [post.getAttribute('subreddit-prefixed-name'), viewItem(post)]),
    ).toEqual([
      ['r/AskReddit', expect.objectContaining({ reason: 'Blocked Source' })],
      ['r/AskReddit', expect.objectContaining({ reason: 'Blocked Source' })],
      ['r/AskReddit', expect.objectContaining({ reason: 'Blocked Source' })],
    ]);
  });

  it('hides a blocked user’s posts and comments', async () => {
    const user: BlockedSource = { site: 'reddit', account: 'u/troublerecent7320', name: 'u/TroubleRecent7320' };
    await protectionState.setValue({ ...stateWithTopics(severance()), blockedSources: [user] });
    await open(thread, '/r/GTA6/comments/1x6l1y5/gta_6_launch_trailer/');
    const comment = redditComment('Nice weather today', { author: 'TroubleRecent7320' });
    document.querySelector('shreddit-comment-tree')!.append(comment);
    const post = redditPost('My dog', { author: 'TroubleRecent7320' });
    document.body.append(post);
    await settle();

    expect(viewItem(comment.querySelector('[slot="comment"]')!)).toMatchObject({ reason: 'Blocked Source' });
    expect(viewItem(post)).toMatchObject({ reason: 'Blocked Source' });
  });

  it('blocks a hidden post’s subreddit from its cover, and a hidden comment’s author from the right-click menu', async () => {
    await protectionState.setValue(stateWithTopics(gta6()));
    vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockImplementation(async (_tabId, message) => answerFromPage(message));
    await open(thread, '/r/GTA6/comments/1x6l1y5/gta_6_launch_trailer/');
    const post = redditPost('Leonida map leaked', { subreddit: 'r/GTALeaks', author: 'Leaker' });
    const comment = redditComment('Leonida burns at the end', { author: 'Spoiler_Guy' });
    document.querySelector('shreddit-comment-tree')!.append(comment);
    document.body.append(post);
    await settle();

    clickCoverButton(post, 'Block source');
    comment.querySelector('blackout-cover')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, composed: true }));
    await blockSourceUnderPointer(1, 0, 'u/');
    await settle();

    expect(await blockedSources()).toEqual([
      { site: 'reddit', account: 'r/gtaleaks', name: 'r/GTALeaks' },
      { site: 'reddit', account: 'u/spoiler_guy', name: 'u/Spoiler_Guy' },
    ]);
  });

  it('blocks a subreddit or a user from the right-click menu', async () => {
    await protectionState.setValue(stateWithTopics(severance()));
    vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockImplementation(async (_tabId, message) => answerFromPage(message));
    await open(homeFeed, '/');
    const [subredditEntry, userEntry] = BLOCK_MENU_ENTRIES.filter((entry) =>
      (entry.sites as readonly string[]).includes('*://www.reddit.com/*'),
    );
    expect([subredditEntry?.title, userEntry?.title]).toEqual(['Block this subreddit', 'Block this user']);

    const post = postTitled('Texting someone too much?');
    post.querySelector('[slot="title"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await blockSourceUnderPointer(1, 0, userEntry!.accountPrefix);
    await blockSourceUnderPointer(1, 0, subredditEntry!.accountPrefix);

    expect(await blockedSources()).toEqual([
      { site: 'reddit', account: 'u/hognose4life', name: 'u/Hognose4life' },
      { site: 'reddit', account: 'r/texts', name: 'r/texts' },
    ]);
  });

  it('suggests blocking a subreddit after 3 of its posts are hidden for a topic in a day', async () => {
    await protectionState.setValue(stateWithTopics(gta6()));
    await open(subreddit, '/r/GTA6/');

    expect(viewToast()).toEqual({
      title: 'Block r/GTA6?',
      text: expect.stringMatching(/^Blackout hid \d+ of its GTA 6 items today\.$/),
      buttons: ['Not now', 'Block'],
    });
    expect(await blockedSources()).toEqual([]);
  });

  it('counts a thread covered for a topic towards both its subreddit and its author', async () => {
    await protectionState.setValue(stateWithTopics(gta6()));
    await open(thread, '/r/GTA6/comments/1x6l1y5/gta_6_launch_trailer/');
    clickPageCoverButton('Continue to page');
    await settle();
    clickPageCoverButton('Continue');
    await settle();

    // The thread and its own post are one item; its comments count for their authors only.
    const tallies = Object.values((await suggestedBlockCounts.getValue()).tallies);
    const itemsOf = (account: string) => tallies.find((tally) => tally.source.account === account)?.itemKeys;
    // Related posts beside it from r/GTA6 count too, each once.
    const subredditItems = itemsOf('r/gta6')!;
    expect(subredditItems.filter((key) => key === 't3_1x6l1y5')).toHaveLength(1);
    expect(new Set(subredditItems).size).toBe(subredditItems.length);
    expect(itemsOf('u/pastacheed')).toEqual(['t3_1x6l1y5']);
    expect(itemsOf('u/troublerecent7320')).toHaveLength(1);
  });
});
