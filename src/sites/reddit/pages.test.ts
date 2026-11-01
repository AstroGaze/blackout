// @vitest-environment-options {"happyDOM": {"url": "https://www.reddit.com/"}}
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { MASKED_TITLE } from '@/guard/page-cover-guard';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { protectionState } from '@/protection/state';
import { clickPageCoverButton, readableText, renderPage, settle, viewPage } from '@/test/page';
import { gta6, stateWithTopics } from '@/test/state';
import { reddit } from './adapter';
import subredditPage from './fixtures/subreddit-header.html?raw';
import userProfile from './fixtures/user-profile.html?raw';
import { viewItem } from './fixtures/view';

/** Strong mentions of GTA 6 a user could read. */
const NAMES_GTA6 = /\bgta ?(6|vi)\b|\bgta6\b|grand theft auto (vi|6)\b|\bleonida\b/i;
/** Text only screen readers get. */
const SCREEN_READER_ONLY = 'faceplate-screen-reader-content, screen-reader-alert-outlet';

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

describe('a subreddit about GTA 6', () => {
  it('is covered as a whole, its wiki and other feeds too, until the user continues', async () => {
    await open(subredditPage, '/r/GTA6/');
    expect(viewPage()).toEqual({ title: MASKED_TITLE, state: 'covered', reason: 'GTA 6' });

    guard?.stop();
    await open(subredditPage, '/r/GTA6/wiki/index/');
    expect(viewPage()).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('keeps its sidebar covered after continuing: title, description, rules and links', async () => {
    await open(subredditPage, '/r/GTA6/');
    clickPageCoverButton('Continue to page');
    await settle();
    clickPageCoverButton('Continue');
    await settle();

    expect(viewItem(document.querySelector('#subreddit-right-rail__partial')!)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });
});

describe('a Reddit user’s profile', () => {
  it('leaves nothing that names GTA 6 readable among their comments', async () => {
    await open(userProfile, '/user/TekS_/');

    expect(document.querySelectorAll('shreddit-profile-comment[data-blackout="covered"]').length).toBeGreaterThanOrEqual(3);
    expect(readableText(NAMES_GTA6, { ignore: SCREEN_READER_ONLY })).toEqual([]);
  });

  it('covers the communities beside the profile that are about GTA 6', async () => {
    await open(userProfile, '/user/TekS_/');
    const list = document.querySelector('aside[aria-label="Profile information"] ul')!;
    const community = document.createElement('li');
    community.innerHTML = '<a href="/r/GTA6/"><span>r/GTA6</span></a>';
    list.append(community);
    await settle();

    expect(viewItem(community)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });
});
