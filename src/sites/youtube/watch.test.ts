import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { renderPage, settle } from '@/test/page';
import { youtube } from './adapter';
import watch from './fixtures/watch.html?raw';
import { coveredTitles, viewItem, viewItems } from './fixtures/view';

const COMMENT = 'ytd-comment-view-model';
const RECOMMENDATION = 'ytd-watch-next-secondary-results-renderer yt-lockup-view-model';

let guard: PageGuard | undefined;

beforeEach(async () => {
  fakeBrowser.reset();
  guard = startPageGuard(youtube);
  // "Grand Theft Auto VI Trailer 2", scrolled down to load comments.
  renderPage(watch);
  await settle();
});

afterEach(() => guard?.stop());

describe('YouTube watch page with the ready-made GTA 6 topic', () => {
  it('covers the comments that name GTA 6', () => {
    expect(coveredTitles(COMMENT)).toEqual([
      'Here we go again ... 378 days left till GTA VI',
      expect.stringMatching(/^Here after the final trailer pre launch \(probably\) This will always be my favourite gta vi trailer/),
      'Thanks for dropping GTA VI trailer 2. Now we have another year of youtubers doing trailer analysis and game speculations.',
      'GTA VI will last so long that our grandchildren will probably play it too',
    ]);
  });

  it('shows comments where a Weak Term like "Jason" stands alone', () => {
    const shown = viewItems(COMMENT).filter((view) => view.state === 'shown');
    expect(shown.map((view) => view.title)).toEqual(
      expect.arrayContaining([
        'Jason got more leaks to fix',
        "Jason's house might be flooded now",
        "i’m not hiring jason as my repair man",
      ]),
    );
    expect(shown).toHaveLength(56);
  });

  it('checks a reply on its own, apart from the comment it answers', async () => {
    const thread = Array.from(document.querySelectorAll('ytd-comment-thread-renderer')).find((item) =>
      item.textContent?.includes('Jason got more leaks to fix'),
    )!;
    const reply = thread.querySelector(COMMENT)!.cloneNode(true) as Element;
    reply.querySelector('#content-text')!.textContent = 'Wait until you see the Leonida Keys';
    reply.querySelector('a[href*="lc="]')!.setAttribute('href', '/watch?v=VQRLujxTm3c&lc=reply');
    thread.querySelector('ytd-comment-replies-renderer #contents')!.append(reply);
    await settle();

    expect([viewItem(thread.querySelector(COMMENT)!), viewItem(reply)]).toEqual([
      { title: 'Jason got more leaks to fix', state: 'shown' },
      { title: 'Wait until you see the Leonida Keys', state: 'covered', reason: 'GTA 6' },
    ]);
  });

  it('covers the suggestions on the player end screen that are about GTA 6', () => {
    expect(coveredTitles('.ytp-modern-videowall-still')).toEqual(
      expect.arrayContaining([
        'GTA 6 (Grand Theft Auto 6) - Official Extended Gameplay',
        'Grand Theft Auto VI Trailer 1',
        "15 THINGS From GTA 5 You WON'T Be Able To Do In GTA 6",
      ]),
    );
    expect(viewItems('.ytp-modern-videowall-still').every((view) => view.state !== 'withheld')).toBe(true);
  });

  it('covers the recommendations beside the video that are about GTA 6', () => {
    const views = viewItems(RECOMMENDATION);
    const covered = views.flatMap((view, index) => (view.state === 'covered' ? [index] : []));
    // Every recommendation whose title names GTA 6, GTA VI or Grand Theft Auto VI.
    expect(covered).toEqual([
      0, 1, 2, 3, 5, 7, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 25, 30, 32, 35, 36, 37, 38,
      39, 40, 41, 43, 47, 48, 50, 51, 53, 54, 55, 57, 58,
    ]);
    expect(views.filter((view) => view.state === 'shown').map((view) => view.title)).toEqual(
      expect.arrayContaining(['Homeless Man Becomes PRESIDENT in GTA 5', 'Red Dead Redemption 2 Trailer']),
    );
  });
});
