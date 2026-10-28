import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import * as page from '@/test/page';
import { clickPageCoverButton, renderPage, settle, viewPage } from '@/test/page';
import { GTA6_PRESET } from '@/protection/state';
import { setTopicEnabled, updateProtection } from '@/protection/topics';
import { youtube } from './adapter';
import gtaWatchPage from './fixtures/watch.html?raw';
import otherWatchPage from './fixtures/watch-other.html?raw';
import { coveredTitles, viewItems } from './fixtures/view';

const GTA_VIDEO = 'VQRLujxTm3c'; // "Grand Theft Auto VI Trailer 2" by Rockstar Games
const OTHER_VIDEO = 'gmA6MrX81z4'; // "Red Dead Redemption 2 Trailer" by Rockstar Games
const MASKED_TITLE = 'Hidden by Blackout';
const COMMENT = 'ytd-comment-view-model';

let guard: PageGuard | undefined;

beforeEach(() => {
  fakeBrowser.reset();
  document.title = '';
  document.body.replaceChildren();
});

afterEach(() => {
  guard?.stop();
  guard = undefined;
});

/** Opens a watch page the way a full page load does: the guard starts first. */
function startLoading(videoId: string, html: string) {
  history.replaceState(null, '', `/watch?v=${videoId}`);
  guard = startPageGuard(youtube);
  renderPage(html);
}

describe('YouTube watch pages with the ready-made GTA 6 topic', () => {
  it('covers the whole page and masks the tab title when the video is about GTA 6', async () => {
    startLoading(GTA_VIDEO, gtaWatchPage);
    await settle();

    expect(viewPage()).toEqual({ title: MASKED_TITLE, state: 'covered', reason: 'GTA 6' });
  });

  it('shows nothing, and masks the tab title, until the page has been checked', async () => {
    startLoading(GTA_VIDEO, gtaWatchPage);
    await Promise.resolve();

    expect(viewPage()).toMatchObject({ title: MASKED_TITLE });
    expect(viewPage().state).not.toBe('shown');
  });

  it('shows a watch page whose video is not about GTA 6', async () => {
    startLoading(OTHER_VIDEO, otherWatchPage);
    await settle();

    expect(viewPage()).toEqual({ title: 'Red Dead Redemption 2 Trailer - YouTube', state: 'shown' });
  });

  it('continues to the page only after confirming, and gives the tab its title back', async () => {
    startLoading(GTA_VIDEO, gtaWatchPage);
    await settle();

    clickPageCoverButton('Continue to page');
    await settle();
    expect(viewPage()).toMatchObject({ state: 'covered', reason: 'GTA 6' });

    clickPageCoverButton('Continue');
    await settle();
    expect(viewPage()).toEqual({ title: 'Grand Theft Auto VI Trailer 2 - YouTube', state: 'shown' });
  });

  it('keeps comments with only a Weak Term hidden on a continued page about GTA 6', async () => {
    startLoading(GTA_VIDEO, gtaWatchPage);
    await settle();
    clickPageCoverButton('Continue to page');
    await settle();
    clickPageCoverButton('Continue');
    await settle();

    expect(coveredTitles(COMMENT)).toEqual(
      expect.arrayContaining([
        'Jason got more leaks to fix',
        "Jason's house might be flooded now",
        "i’m not hiring jason as my repair man",
        'Thanks for dropping GTA VI trailer 2. Now we have another year of youtubers doing trailer analysis and game speculations.',
      ]),
    );
    expect(coveredTitles(COMMENT)).toHaveLength(10);
  });

  it('shows comments with only a Weak Term on a page that is not about GTA 6', async () => {
    startLoading(OTHER_VIDEO, otherWatchPage);
    await settle();

    expect(viewItems(COMMENT).find((view) => view.title.includes('Jason'))).toEqual({
      title: '“You gotta know when to get off, Jason. You hear me?”',
      state: 'shown',
    });
  });

  it('checks the page again after navigating inside YouTube to a video about GTA 6', async () => {
    startLoading(OTHER_VIDEO, otherWatchPage);
    await settle();

    navigateTo(GTA_VIDEO);
    await settle();
    // YouTube still shows the previous video's details until it loads the new ones.
    expect(viewPage()).toMatchObject({ title: MASKED_TITLE, state: 'hidden' });

    showVideoDetails(GTA_VIDEO, 'Grand Theft Auto VI Trailer 2', 'Grand Theft Auto VI Trailer 2 - YouTube');
    await settle();
    expect(viewPage()).toEqual({ title: MASKED_TITLE, state: 'covered', reason: 'GTA 6' });
  });

  it('removes the cover, and the topic context, after navigating to a video not about GTA 6', async () => {
    startLoading(GTA_VIDEO, gtaWatchPage);
    await settle();

    navigateTo(OTHER_VIDEO);
    showVideoDetails(OTHER_VIDEO, 'Red Dead Redemption 2 Trailer', 'Red Dead Redemption 2 Trailer - YouTube');
    await settle();

    expect(viewPage()).toEqual({ title: 'Red Dead Redemption 2 Trailer - YouTube', state: 'shown' });
    expect(viewItems(COMMENT).find((view) => view.title === 'Jason got more leaks to fix')).toMatchObject({
      state: 'shown',
    });
  });

  it('checks the page when YouTube marks the details with the new video last', async () => {
    startLoading(OTHER_VIDEO, otherWatchPage);
    await settle();

    navigateTo(GTA_VIDEO);
    const metadata = document.querySelector('ytd-watch-metadata')!;
    metadata.querySelector('#title h1')!.textContent = 'Grand Theft Auto VI Trailer 2';
    await settle();
    metadata.setAttribute('video-id', GTA_VIDEO);
    await settle();

    expect(viewPage()).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it("doesn't trust the previous video's details once they are marked with the new video", async () => {
    startLoading(OTHER_VIDEO, otherWatchPage);
    await settle();

    navigateTo(GTA_VIDEO);
    document.querySelector('ytd-watch-metadata')!.setAttribute('video-id', GTA_VIDEO);
    await settle();
    expect(viewPage()).toMatchObject({ title: MASKED_TITLE, state: 'hidden' });

    showVideoDetails(GTA_VIDEO, 'Grand Theft Auto VI Trailer 2', 'Grand Theft Auto VI Trailer 2 - YouTube');
    await settle();
    expect(viewPage()).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it("keeps a covered video's title off the tab after leaving, before YouTube sets a new one", async () => {
    startLoading(GTA_VIDEO, gtaWatchPage);
    await settle();

    history.pushState(null, '', '/');
    document.body.append(document.createElement('div'));
    await settle();

    expect(document.title).not.toContain('Grand Theft Auto');
  });

  it('plays a video that started during the check once the page passes', async () => {
    startLoading(OTHER_VIDEO, otherWatchPage);
    const video = document.querySelector('video')!;
    await video.play();
    expect(video.paused).toBe(true);

    await settle();

    expect(video.paused).toBe(false);
  });

  it("checks the video's own description on a page that is shown", async () => {
    startLoading(OTHER_VIDEO, otherWatchPage);
    await settle();
    const description = document.querySelector('#description-inner')!;

    const line = document.createElement('span');
    line.textContent = 'Also: my full Leonida map tour is up';
    description.append(line);
    await settle();

    expect(viewPage()).toMatchObject({ state: 'shown' });
    expect(page.viewItem(description)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('removes the cover, without a reload, when the topic is turned off', async () => {
    startLoading(GTA_VIDEO, gtaWatchPage);
    await settle();

    await updateProtection((state) => setTopicEnabled(state, GTA6_PRESET.id, false));
    await settle();

    expect(viewPage()).toEqual({ title: 'Grand Theft Auto VI Trailer 2 - YouTube', state: 'shown' });
  });

  it('keeps a continued page continued when its topic is turned off and on again', async () => {
    startLoading(GTA_VIDEO, gtaWatchPage);
    await settle();
    clickPageCoverButton('Continue to page');
    await settle();
    clickPageCoverButton('Continue');
    await settle();

    await updateProtection((state) => setTopicEnabled(state, GTA6_PRESET.id, false));
    await settle();
    await updateProtection((state) => setTopicEnabled(state, GTA6_PRESET.id, true));
    await settle();

    expect(viewPage()).toEqual({ title: 'Grand Theft Auto VI Trailer 2 - YouTube', state: 'shown' });
    // The page is about GTA 6 again, so Weak Terms on it count again.
    expect(coveredTitles(COMMENT)).toContain('Jason got more leaks to fix');
  });

  it('masks the page while the stored protection state is broken', async () => {
    startLoading(OTHER_VIDEO, otherWatchPage);
    await settle();

    await fakeBrowser.storage.local.set({ protectionState: { topics: [{ name: 'GTA 6', terms: [{ text: null }] }] } });
    await settle();

    expect(viewPage()).toMatchObject({ title: MASKED_TITLE });
    expect(viewPage().state).not.toBe('shown');
  });

  it('removes the cover after leaving the watch page for the home feed', async () => {
    startLoading(GTA_VIDEO, gtaWatchPage);
    await settle();

    history.pushState(null, '', '/');
    document.title = 'YouTube';
    await settle();

    expect(viewPage()).toEqual({ title: 'YouTube', state: 'shown' });
  });

  it("doesn't let the video play behind the cover", async () => {
    startLoading(GTA_VIDEO, gtaWatchPage);
    await settle();
    const video = document.querySelector('video')!;

    await video.play();
    expect(video.paused).toBe(true);

    clickPageCoverButton('Continue to page');
    await settle();
    clickPageCoverButton('Continue');
    await settle();
    await video.play();
    expect(video.paused).toBe(false);
  });

  it("covers the page as unchecked when YouTube doesn't show the video's details in time", async () => {
    vi.useFakeTimers();
    try {
      history.replaceState(null, '', `/watch?v=${GTA_VIDEO}`);
      guard = startPageGuard(youtube);
      renderPage(gtaWatchPage);
      document.querySelector('ytd-watch-metadata')!.setAttribute('video-id', 'still-loading');
      await vi.advanceTimersByTimeAsync(10_000);

      expect(viewPage()).toEqual({ title: MASKED_TITLE, state: 'covered', reason: 'Unchecked page' });
    } finally {
      vi.useRealTimers();
    }
  });
});

/** Navigates inside YouTube without a page load, as clicking a video does. */
function navigateTo(videoId: string) {
  history.pushState(null, '', `/watch?v=${videoId}`);
  document.title = 'YouTube';
}

/** Shows a video's details in the watch page metadata, as YouTube does once loaded. */
function showVideoDetails(videoId: string, title: string, tabTitle: string) {
  const metadata = document.querySelector('ytd-watch-metadata')!;
  metadata.querySelector('#title h1')!.textContent = title;
  metadata.setAttribute('video-id', videoId);
  document.title = tabTitle;
}
