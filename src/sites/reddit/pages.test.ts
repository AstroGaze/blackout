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

  it('covers each highlight about GTA 6 by its link, which shows a cover whenever Reddit draws the card', async () => {
    await open(subredditPage, '/r/GTA6/');
    clickPageCoverButton('Continue to page');
    await settle();
    clickPageCoverButton('Continue');
    await settle();

    const links = Array.from(document.querySelectorAll('community-highlight-carousel a[href*="/comments/"]'));
    const trailer = links.find((link) => link.getAttribute('href')?.includes('gta_6_launch_trailer'))!;
    expect(viewItem(trailer)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
    expect(trailer.querySelector(':scope > blackout-cover')).not.toBeNull();
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

describe('a covered item that draws itself in its own shadow root', () => {
  it('shows its cover there, opaque, since the site would never show a cover added beside its content', async () => {
    history.replaceState(null, '', '/');
    guard = startPageGuard(reddit);
    // Like a community highlight: text for the page, and a shadow root with no slot for anything else.
    const card = document.createElement('community-highlight-card');
    card.innerHTML = '<span>GTA 6 Launch Trailer</span>';
    card.attachShadow({ mode: 'open' }).innerHTML = '<div class="image">GTA6 wiki</div>';
    document.body.append(card);
    await settle();

    expect(viewItem(card).state).toBe('covered');
    const cover = Array.from(card.shadowRoot!.children).find((child) => child.localName === 'blackout-cover');
    expect(cover).not.toBeNull();
    expect(cover!.shadowRoot!.querySelector('[data-slot="cover-topic"]')!.textContent).toBe('GTA 6');
    expect(cover!.shadowRoot!.querySelector('[role="group"]')!.className).toContain('bg-background');
    expect(cover!.shadowRoot!.querySelector('[role="group"]')!.className).not.toContain('bg-background/75');
  });

  it('moves its cover inside when the site draws the item after Blackout has covered it', async () => {
    history.replaceState(null, '', '/');
    guard = startPageGuard(reddit);
    const card = document.createElement('community-highlight-card');
    card.innerHTML = '<span>GTA 6 Launch Trailer</span>';
    document.body.append(card);
    await settle();
    // The site's code runs later, and draws the card in a shadow root with no slot for the cover.
    card.attachShadow({ mode: 'open' }).innerHTML = '<div class="image">GTA6 wiki</div>';
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(Array.from(card.shadowRoot!.children).some((child) => child.localName === 'blackout-cover')).toBe(true);
    expect(card.querySelector(':scope > blackout-cover')).toBeNull();
    expect(viewItem(card)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('keeps a cover beside the content when the shadow root shows it, as a post’s does', async () => {
    history.replaceState(null, '', '/');
    guard = startPageGuard(reddit);
    const post = document.createElement('shreddit-post');
    post.setAttribute('post-title', 'GTA 6 ending');
    post.innerHTML = '<a slot="title">GTA 6 ending</a>';
    post.attachShadow({ mode: 'open' }).innerHTML = '<slot name="title"></slot><slot></slot>';
    document.body.append(post);
    await settle();

    expect(post.querySelector(':scope > blackout-cover')).not.toBeNull();
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
