// @vitest-environment-options {"happyDOM": {"url": "https://www.reddit.com/"}}
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { protectionState } from '@/protection/state';
import { clickPageCoverButton, isKeyboardReachable, renderPage, settle, viewPage } from '@/test/page';
import { gta6, stateWithTopics } from '@/test/state';
import { reddit } from './adapter';
import homeFeed from './fixtures/home-feed.html?raw';
import { redditPost } from './fixtures/post';
import subreddit from './fixtures/subreddit.html?raw';
import { coveredTitles, shownTitles, viewItem } from './fixtures/view';

const POST = 'shreddit-post';

let guard: PageGuard | undefined;

beforeEach(async () => {
  fakeBrowser.reset();
  document.body.replaceChildren();
  await protectionState.setValue(stateWithTopics(gta6()));
});

afterEach(() => {
  guard?.stop();
  guard = undefined;
});

async function open(html: string, path: string) {
  history.replaceState(null, '', path);
  guard = startPageGuard(reddit);
  renderPage(html);
  await settle();
}

const feed = () => document.querySelector('shreddit-feed')!;

describe('the Reddit home feed with the ready-made GTA 6 topic', () => {
  beforeEach(() => open(homeFeed, '/'));

  it('covers the post from r/GTA6, whose subreddit name says GTA 6, and shows the rest', () => {
    expect(coveredTitles(POST)).toEqual(['New Footage via South Park']);
    expect(shownTitles(POST)).toHaveLength(27);
    expect(viewPage()).toMatchObject({ state: 'shown' });
  });

  it('checks posts that arrive later as the feed scrolls, their flair and text too', async () => {
    const posts = [
      redditPost('Leonida map leaked'),
      redditPost('Look at this', { flair: 'GTA 6 Leak' }),
      redditPost('Long post', { body: 'The ending of GTA VI is that…' }),
      redditPost('My cat sleeping'),
    ];
    feed().append(...posts);
    await settle();

    expect(posts.map((post) => viewItem(post).state)).toEqual(['covered', 'covered', 'covered', 'shown']);
    expect(isKeyboardReachable(posts[0]!.querySelector('[slot="title"]')!)).toBe(false);
  });

  it('covers a post that spells the game "Grand Theft Auto 6"', async () => {
    const post = redditPost('Rockstar Games have begun to distribute review code of Grand Theft Auto 6');
    feed().append(post);
    await settle();

    expect(viewItem(post)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('shows a post with only a Weak Term outside the topic’s own subreddit', async () => {
    const post = redditPost('Jason looks different now', { subreddit: 'r/pics' });
    feed().append(post);
    await settle();

    expect(viewItem(post).state).toBe('shown');
  });
});

describe('r/GTA6, the topic’s own subreddit', () => {
  beforeEach(async () => {
    await open(subreddit, '/r/GTA6/');
    // The whole subreddit is about GTA 6, so it is covered until the user continues.
    expect(viewPage()).toMatchObject({ state: 'covered', reason: 'GTA 6' });
    clickPageCoverButton('Continue to page');
    await settle();
    clickPageCoverButton('Continue');
    await settle();
  });

  it('covers the posts that name GTA 6 and shows the rest', () => {
    expect(coveredTitles(POST)).toEqual(
      expect.arrayContaining([
        '[Countdown] GTA VI Preload Countdown Timer',
        'GTA 6 Launch Trailer',
        'Grand Theft Auto VI exclusive – The state that never sleeps',
        'Rockstar Games has recreated the VICE CITY sign from GTA 6 in Miami',
        'GTA6 box art in EBGames Canada:',
      ]),
    );
    expect(shownTitles(POST)).toEqual(expect.arrayContaining(['vignette', 'Every. time.']));
  });

  it('hides a post with only a Weak Term, since everything here is about GTA 6', async () => {
    const post = redditPost('Jason looks different now', { subreddit: 'r/GTA6' });
    feed().append(post);
    await settle();

    expect(viewItem(post)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('covers the community highlights that name GTA 6', () => {
    expect(coveredTitles('community-highlight-card')).toEqual(
      expect.arrayContaining([expect.stringContaining('GTA 6 Launch Trailer')]),
    );
  });
});
