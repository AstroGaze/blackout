// @vitest-environment-options {"happyDOM": {"url": "https://x.com/"}}
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { protectionState } from '@/protection/state';
import { readableText, renderPage, settle, viewPage } from '@/test/page';
import { gta6, stateWithTopics } from '@/test/state';
import { x } from './adapter';
import searchResults from './fixtures/search-results.html?raw';
import searchSuggestions from './fixtures/search-suggestions.html?raw';
import trending from './fixtures/trending.html?raw';
import { xTrend } from './fixtures/post';
import { coveredTitles, shownTitles, viewItem } from './fixtures/view';

/** Any row of the search box's dropdown. */
const ROW = '[id^="typeaheadDropdown"] [role="option"]';
const NAMES_GTA6 = /\bgta ?(6|vi)\b|\bgta6\b|grand theft auto (vi|6)\b|\bleonida\b/i;

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
  guard = startPageGuard(x);
  renderPage(html);
  await settle();
}

describe('X search suggestions for "gta"', () => {
  beforeEach(() => open(searchSuggestions, '/explore'));

  it('covers the suggested searches and accounts about GTA 6 and shows the rest', () => {
    const rows = coveredTitles(ROW);
    expect(rows).toEqual(expect.arrayContaining(['gta 6', 'gta 6 leak', expect.stringContaining('GTA 6 Intel'), expect.stringContaining('GTA 6 Info')]));
    expect(shownTitles(ROW)).toEqual(expect.arrayContaining(['gta', expect.stringContaining('GTA Series Videos')]));
  });

  it('checks new rows as the typed text changes, and recent searches before anything is typed', async () => {
    const list = document.querySelector(ROW)!.parentElement!;
    const recent = document.createElement('div');
    recent.setAttribute('role', 'option');
    recent.innerHTML = '<button role="button" type="button"><span>gta 6 ending explained</span></button><button aria-label="Remove">×</button>';
    list.append(recent);
    await settle();

    expect(viewItem(recent)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('keeps the page itself shown', () => {
    expect(viewPage().state).toBe('shown');
  });
});

describe('X search results for "gta 6"', () => {
  beforeEach(() => open(searchResults, '/search'));

  it('covers every post about GTA 6, leaving nothing naming it readable', () => {
    expect(coveredTitles('article')).toHaveLength(6);
    expect(readableText(NAMES_GTA6)).toEqual([]);
  });
});

describe('X trends', () => {
  beforeEach(() => open(trending, '/explore/tabs/trending'));

  it('covers a trend about GTA 6 and shows the rest', async () => {
    const trend = xTrend('Leonida');
    document.querySelector('[data-testid="trend"]')!.parentElement!.append(trend);
    await settle();

    expect(viewItem(trend)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
    expect(shownTitles('[data-testid="trend"]')).toEqual(expect.arrayContaining([expect.stringContaining('Kimi Antonelli')]));
  });
});
