// @vitest-environment-options {"happyDOM": {"url": "https://x.com/"}}
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { MASKED_TITLE } from '@/guard/page-cover-guard';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { protectionState } from '@/protection/state';
import { clickPageCoverButton, readableText, renderPage, settle, viewPage } from '@/test/page';
import { gta6, stateWithTopics, topic } from '@/test/state';
import { x } from './adapter';
import postLoggedOut from './fixtures/post-logged-out.html?raw';
import post from './fixtures/post.html?raw';
import { xPost } from './fixtures/post';
import { coveredTitles, shownTitles, viewItem } from './fixtures/view';

const TRAILER = '/RockstarGames/status/2110717537964953810';
/** Strong mentions of GTA 6 a user could read. */
const NAMES_GTA6 = /\bgta ?(6|vi)\b|\bgta6\b|grand theft auto (vi|6)\b|\bleonida\b/i;
/** Text only screen readers get. */
const SCREEN_READER_ONLY = '.sr-only';

let guard: PageGuard | undefined;

beforeEach(() => {
  fakeBrowser.reset();
  document.body.replaceChildren();
});

afterEach(() => {
  guard?.stop();
  guard = undefined;
});

async function open(html: string, path: string) {
  history.replaceState(null, '', path);
  guard = startPageGuard(x);
  renderPage(html);
  await settle();
}

/** Continues past the page cover, which asks to confirm first. */
async function continueToPage() {
  clickPageCoverButton('Continue to page');
  await settle();
  clickPageCoverButton('Continue');
  await settle();
}

const titled = (start: string) =>
  Array.from(document.querySelectorAll('article')).find((article) => article.textContent?.includes(start))!;

describe('a post on X about GTA 6, signed in', () => {
  beforeEach(async () => {
    await protectionState.setValue(stateWithTopics(gta6()));
    await open(post, TRAILER);
  });

  it('covers the whole page and masks the tab title, which quotes the post, until the user continues', async () => {
    expect(viewPage()).toEqual({ title: MASKED_TITLE, state: 'covered', reason: 'GTA 6' });

    await continueToPage();

    expect(viewPage()).toMatchObject({ state: 'shown', title: expect.stringMatching(/^Rockstar Games en X: "Watch the Grand Theft Auto VI/) });
  });

  it('covers the replies that name GTA 6, and those with only a Weak Term since the post is about it', async () => {
    await continueToPage();
    const reply = xPost('Lucia is going to betray Jason', { author: 'fan' });
    titled('No one message me').parentElement!.append(reply);
    await settle();

    expect(viewItem(titled('We really got the GTA 6 trailer'))).toMatchObject({ state: 'covered', reason: 'GTA 6' });
    expect(viewItem(reply)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
    expect(shownTitles('article')).toEqual(expect.arrayContaining(["No one message me on the 19th I'm BUSYYYY"]));
  });

  it('leaves nothing that names GTA 6 readable once the user continues', async () => {
    await continueToPage();

    expect(readableText(NAMES_GTA6)).toEqual([]);
  });
});

describe('a post on X about GTA 6, logged out', () => {
  beforeEach(async () => {
    await protectionState.setValue(stateWithTopics(gta6()));
    await open(postLoggedOut, TRAILER);
  });

  it('covers the whole page and masks the tab title until the user continues', async () => {
    expect(viewPage()).toEqual({ title: MASKED_TITLE, state: 'covered', reason: 'GTA 6' });

    await continueToPage();

    expect(viewPage().state).toBe('shown');
  });

  it('covers the replies about GTA 6, Weak Terms alone included, and leaves nothing naming it readable', async () => {
    await continueToPage();

    // "LUCIA IN THE SHOWER" has only a Weak Term, which counts on a page about GTA 6.
    expect(coveredTitles('[role="link"][data-href*="/status/"]')).toEqual(expect.arrayContaining([expect.stringMatching(/^LUCIA IN THE SHOWER/)]));
    expect(readableText(NAMES_GTA6, { ignore: SCREEN_READER_ONLY })).toEqual([]);
  });
});

describe('a post on X about something else', () => {
  it('is shown, with its replies checked one by one', async () => {
    await protectionState.setValue(stateWithTopics(topic('Severance', { strong: ['Lumon'] })));
    await open(post, TRAILER);

    expect(viewPage().state).toBe('shown');
    expect(coveredTitles('article')).toEqual([]);
  });

  it('isn’t a single post when it lists a post’s quotes or reposts', async () => {
    await protectionState.setValue(stateWithTopics(gta6()));
    await open(post, `${TRAILER}/quotes`);

    expect(viewPage().state).toBe('shown');
  });

  it('waits for its own post after navigating, rather than checking the one still on the page', async () => {
    await protectionState.setValue(stateWithTopics(gta6()));
    // X has moved to another post, but still shows the trailer post.
    await open(post, '/someone/status/1');

    expect(viewPage()).toMatchObject({ state: 'hidden' });
  });
});
