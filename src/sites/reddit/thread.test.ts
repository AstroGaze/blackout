// @vitest-environment-options {"happyDOM": {"url": "https://www.reddit.com/"}}
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { MASKED_TITLE } from '@/guard/page-cover-guard';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { protectionState } from '@/protection/state';
import { clickPageCoverButton, renderPage, settle, viewPage } from '@/test/page';
import { gta6, stateWithTopics, topic } from '@/test/state';
import { reddit } from './adapter';
import { redditComment } from './fixtures/post';
import thread from './fixtures/thread.html?raw';
import { coveredTitles, viewItem } from './fixtures/view';

const THREAD = '/r/GTA6/comments/1x6l1y5/gta_6_launch_trailer/';
const COMMENT = 'shreddit-comment [slot="comment"]';

let guard: PageGuard | undefined;

beforeEach(() => {
  fakeBrowser.reset();
  document.body.replaceChildren();
});

afterEach(() => {
  guard?.stop();
  guard = undefined;
});

async function openThread() {
  history.replaceState(null, '', THREAD);
  guard = startPageGuard(reddit);
  renderPage(thread);
  await settle();
}

/** Continues past the page cover, which asks to confirm first. */
async function continueToPage() {
  clickPageCoverButton('Continue to page');
  await settle();
  clickPageCoverButton('Continue');
  await settle();
}

const commentSaying = (start: string) =>
  Array.from(document.querySelectorAll(COMMENT)).find((comment) => comment.textContent?.trim().startsWith(start))!;

describe('a Reddit thread about GTA 6', () => {
  beforeEach(async () => {
    await protectionState.setValue(stateWithTopics(gta6()));
    await openThread();
  });

  it('covers the whole thread and masks the tab title until the user continues', async () => {
    expect(viewPage()).toEqual({ title: MASKED_TITLE, state: 'covered', reason: 'GTA 6' });

    await continueToPage();

    expect(viewPage()).toEqual({ title: 'GTA 6 Launch Trailer : r/GTA6', state: 'shown' });
  });

  it('covers the comments that name GTA 6, and those with only a Weak Term since the thread is about it', async () => {
    await continueToPage();

    expect(coveredTitles(COMMENT)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Its so poetic the only time the Gta 6 community/),
        expect.stringMatching(/^Very interested on what happened to Jason in the army/),
        expect.stringMatching(/^Hearing him say “Grand Theft Auto VI, coming November 19th/),
        expect.stringMatching(/^This just proved all the Jason haters wrong/),
      ]),
    );
    expect(viewItem(commentSaying('The city itself looks so fucking good')).state).toBe('shown');
  });

  it('covers a reply on its own, leaving the comment it answers shown', async () => {
    await continueToPage();
    const parent = commentSaying('fk the strip club');
    const reply = parent.closest('shreddit-comment')!.querySelector('shreddit-comment')!;
    const replyText = reply.querySelector('[slot="comment"]')!;

    replyText.textContent = 'Leonida gets nuked at the end';
    await settle();

    expect(viewItem(replyText)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
    expect(viewItem(parent).state).toBe('shown');
  });

  it('checks comments loaded later', async () => {
    await continueToPage();
    const comment = redditComment('Lucia is the real hero');
    document.querySelector('shreddit-comment-tree')!.append(comment);
    await settle();

    expect(viewItem(comment.querySelector('[slot="comment"]')!)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('covers related posts and suggested questions beside the thread', async () => {
    await continueToPage();

    expect(coveredTitles('reddit-pdp-right-rail-post').length).toBeGreaterThan(5);
    expect(coveredTitles('#answers-suggested-queries-pdp a')).toContain('GTA 6 launch trailer details');
  });
});

describe('a Reddit thread in a topic’s own subreddit that doesn’t name the topic', () => {
  it('hides comments with only a Weak Term, since the subreddit is about the topic', async () => {
    // Stored as typed into settings, with its prefix and slash.
    const severance = { ...topic('Severance', { strong: ['Lumon'], weak: ['Jason'] }) };
    severance.sources = { ...severance.sources, subreddit: 'r/SeveranceAppleTVPlus/' };
    await protectionState.setValue(stateWithTopics(severance));
    history.replaceState(null, '', '/r/SeveranceAppleTVPlus/comments/1x6l1y5/gta_6_launch_trailer/');
    guard = startPageGuard(reddit);
    renderPage(thread);
    await settle();

    expect(viewPage()).toMatchObject({ state: 'shown' });
    expect(viewItem(commentSaying('Very interested on what happened to Jason'))).toMatchObject({
      state: 'covered',
      reason: 'Severance',
    });
    expect(viewItem(commentSaying('The city itself looks so fucking good')).state).toBe('shown');
  });
});

describe('a Reddit thread when no topic covers it', () => {
  it('shows the thread and its comments without Weak Terms counting', async () => {
    await protectionState.setValue(stateWithTopics(topic('Severance', { strong: ['Lumon'], weak: ['Jason'] })));
    await openThread();

    expect(viewPage()).toMatchObject({ state: 'shown' });
    expect(viewItem(commentSaying('Very interested on what happened to Jason')).state).toBe('shown');
  });
});
