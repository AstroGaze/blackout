import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { renderPage, settle } from '@/test/page';
import { youtube } from './adapter';
import search from './fixtures/search.html?raw';
import { coveredTitles, viewItem, viewItems } from './fixtures/view';

let guard: PageGuard | undefined;

beforeEach(async () => {
  fakeBrowser.reset();
  guard = startPageGuard(youtube);
  // Results for "gta", with "gta " typed into the search box to open suggestions.
  renderPage(search);
  await settle();
});

afterEach(() => guard?.stop());

describe('YouTube search for "gta" with the ready-made GTA 6 topic', () => {
  it('covers the results about GTA 6 and shows the rest', () => {
    expect(coveredTitles('ytd-video-renderer')).toEqual([
      'Grand Theft Auto VI Launch Trailer',
      'Grand Theft Auto VI: An Extended Look',
      'GTA 6 Just Got a TON of NEW Information...',
      'Grand Theft Auto VI Trailer 2',
      'GTA Recap - The Complete Timeline (Watch Before GTA 6!)',
      'Tráiler de lanzamiento de Grand Theft Auto VI',
      'GTA 6 File Size is Absolutely Insane',
      'Grand Theft Auto VI Launch Trailer',
      'Grand Theft Auto VI - Launch Trailer | PS5 Games',
      'Grand Theft Auto VI - Tráiler de lanzamiento',
    ]);
    const shown = viewItems('ytd-video-renderer').filter((view) => view.state === 'shown');
    expect(shown.map((view) => view.title)).toContain('Homeless Man Becomes PRESIDENT in GTA 5');
    expect(shown).toHaveLength(10);
  });

  it.each([
    ['description', '.metadata-snippet-text', 'We drove the whole Leonida coastline'],
    ['channel name', 'ytd-channel-name a', 'GTA 6 Daily'],
  ])('counts a result’s %s as part of its text', async (_, part, text) => {
    const result = Array.from(document.querySelectorAll('ytd-video-renderer')).find((item) =>
      item.textContent?.includes('Homeless Man Becomes PRESIDENT'),
    )!;
    for (const element of result.querySelectorAll(part)) element.textContent = text;
    await settle();

    expect(viewItem(result)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('covers the search suggestions about GTA 6 and shows the rest', () => {
    const views = viewItems('.ytSuggestionComponentSuggestion');
    expect(views.map(({ title, state }) => `${state}: ${title}`)).toEqual([
      'covered: gta 6',
      'covered: gta 6 trailer',
      'shown: gta 5',
      'covered: gta 6 gameplay',
      'shown: gta 5 trailer',
      'shown: gta 4',
      'shown: gta online',
      'covered: gta 6 extended look',
      'covered: gta 6 trailer 2',
      'shown: gta v',
      'shown: gta 5 online',
      'covered: gta vi song',
      'shown: gta san andreas',
      'covered: gta 6 reaction',
    ]);
  });

  it('covers the Shorts in the results shelf that are about GTA 6', () => {
    const views = viewItems('ytm-shorts-lockup-view-model');
    const covered = views.flatMap((view, index) => (view.state === 'covered' ? [index] : []));
    // By title: a #gta6 tag, "GTA 6 Dancing…", another #gta6 tag, "GTA 6's file size…", "POV: GTA 6…".
    expect(covered).toEqual([0, 3, 7, 8, 11]);
    expect(views.filter((view) => view.state === 'shown')).toHaveLength(10);
  });
});
