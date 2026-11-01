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

  it('covers the recent posts beside the feed that are about GTA 6', async () => {
    // Shaped like Reddit's signed-in sidebar: a subreddit link, then the title.
    const recentPosts = document.createElement('recent-posts');
    const row = (subreddit: string, title: string, id: string) =>
      `<div class="mx-md"><div><div class="flex"><a href="https://www.reddit.com/r/${subreddit}/"><div class="ms-xs truncate">r/${subreddit}</div></a></div>` +
      `<a href="/r/${subreddit}/comments/${id}/post/"><div post-id="t3_${id}"><h3>${title}</h3></div></a></div></div><hr>`;
    recentPosts.innerHTML = `<div slot="posts">${row('GTA6', 'To those who are working on Nov 19, are you staying up to play?', 'aaa111')}${row('aviation', 'Crash near me', 'bbb222')}</div>`;
    document.body.append(recentPosts);
    await settle();

    const [gta, other] = Array.from(recentPosts.querySelectorAll('[slot="posts"] > div'));
    expect(viewItem(gta!)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
    expect(viewItem(other!).state).toBe('shown');
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
    expect(coveredTitles('community-highlight-carousel a[href*="/comments/"]')).toEqual(
      expect.arrayContaining([expect.stringContaining('GTA 6 Launch Trailer')]),
    );
  });
});
