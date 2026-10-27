import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { clickCoverButton, renderPage, settle } from '@/test/page';
import { youtube } from './adapter';
import shorts from './fixtures/shorts.html?raw';
import { viewItem } from './fixtures/view';

let guard: PageGuard | undefined;

beforeEach(async () => {
  fakeBrowser.reset();
  guard = startPageGuard(youtube);
  // The Shorts player on "GTA 6's file size is MASSIVE 🫪".
  renderPage(shorts);
  await settle();
});

afterEach(() => guard?.stop());

const player = () => document.querySelector('ytd-reel-video-renderer')!;

describe('YouTube Shorts player with the ready-made GTA 6 topic', () => {
  it('covers a Short about GTA 6', () => {
    expect(viewItem(player())).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('shows the next Short when it is not about GTA 6', async () => {
    // Scrolling to the next Short reuses the player for another video.
    // Its title shows twice: under the video and in the player's title bar.
    for (const title of player().querySelectorAll('yt-shorts-video-title-view-model, .ytp-title-link')) {
      title.textContent = 'Cat jumps into a box';
    }
    for (const link of player().querySelectorAll('a[href*="/shorts/Sa2K2mg5rv8"]')) {
      link.setAttribute('href', 'https://www.youtube.com/shorts/next');
    }
    await settle();

    expect(viewItem(player())).toMatchObject({ state: 'shown' });
  });

  it('stays revealed while the Short plays and its counts change', async () => {
    clickCoverButton(player(), 'Reveal');
    await settle();
    clickCoverButton(player(), 'Show');
    await settle();

    const counter = document.createElement('span');
    counter.textContent = '1.2M likes';
    player().querySelector('reel-action-bar-view-model')!.append(counter);
    await settle();

    expect(viewItem(player())).toMatchObject({ state: 'shown' });
  });
});
