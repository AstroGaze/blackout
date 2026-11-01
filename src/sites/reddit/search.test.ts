// @vitest-environment-options {"happyDOM": {"url": "https://www.reddit.com/"}}
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { protectionState } from '@/protection/state';
import { renderPage, settle } from '@/test/page';
import { gta6, stateWithTopics } from '@/test/state';
import { reddit } from './adapter';
import searchPage from './fixtures/search-suggestions.html?raw';
import searchTrending from './fixtures/search-trending.html?raw';
import { coveredTitles, shownTitles, viewItem } from './fixtures/view';

const SUGGESTION = 'li[data-testid^="search-sdui-"]';
/** Any row of the search box's dropdown. */
const ROW = '#search-dropdown-results-container li';

let guard: PageGuard | undefined;

beforeEach(async () => {
  fakeBrowser.reset();
  document.body.replaceChildren();
  await protectionState.setValue(stateWithTopics(gta6()));
  history.replaceState(null, '', '/');
  guard = startPageGuard(reddit);
  // The home page, with "gta" typed into the search box.
  renderPage(searchPage);
  await settle();
});

afterEach(() => {
  guard?.stop();
  guard = undefined;
});

/** The search box's suggestions, which Reddit keeps in its shadow root. */
const searchBox = () => document.querySelector('reddit-search-large')!.shadowRoot!;

describe('Reddit search suggestions for "gta"', () => {
  it('covers the suggestions about GTA 6 and shows the rest', () => {
    expect(coveredTitles(SUGGESTION, searchBox())).toEqual(
      expect.arrayContaining(['gta 6: lucia closeup 4k', 'gta 6', 'gta 6 leek cyber lucia', 'gta 6 map']),
    );
    expect(shownTitles(SUGGESTION, searchBox())).toContain('gta online');
  });

  it('covers a suggested community about GTA 6', () => {
    const community = Array.from(searchBox().querySelectorAll('li[data-testid="search-sdui-typeahead-suggestion"]')).find(
      (item) => item.querySelector('a[href="/r/GTA6/"]'),
    )!;
    expect(viewItem(community)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('checks new suggestions as the typed text changes', async () => {
    const list = searchBox().querySelector(SUGGESTION)!.parentElement!;
    const fresh = document.createElement('li');
    fresh.setAttribute('data-testid', 'search-sdui-query-autocomplete');
    fresh.setAttribute('data-label', 'leonida keys ending');
    fresh.innerHTML = '<a href="/search/?q=leonida+keys+ending" role="menuitem"><span>leonida keys ending</span></a>';
    list.append(fresh);
    await settle();

    expect(viewItem(fresh)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('checks the search box when protection starts again, as when a Pause ends', async () => {
    guard?.stop();
    await protectionState.setValue(stateWithTopics({ ...gta6(), enabled: false }));
    document.body.replaceChildren();
    guard = startPageGuard(reddit);
    await settle();
    // The search box arrives while nothing is protected.
    renderPage(searchPage);
    await settle();
    expect(coveredTitles(SUGGESTION, searchBox())).toEqual([]);

    await protectionState.setValue(stateWithTopics(gta6()));
    await settle();

    expect(coveredTitles(SUGGESTION, searchBox())).toContain('gta 6 map');
  });

  it('checks suggestions in a search box whose shadow root is attached after it arrives', async () => {
    const host = document.createElement('reddit-search-large');
    document.body.append(host);
    await settle();
    // The element upgrades later and renders into its own shadow root, which changes nothing outside it.
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML =
      '<div id="search-dropdown-results-container"><ul role="menu">' +
      '<li data-testid="search-sdui-query-autocomplete" data-label="gta 6 ending"><a role="menuitem">gta 6 ending</a></li>' +
      '</ul></div>';
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const suggestion = shadow.querySelector('li')!;
    expect(viewItem(suggestion).state).not.toBe('shown');
    await settle();
    expect(viewItem(suggestion)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('checks every row of the empty search box: trending searches and communities, and recent searches', async () => {
    renderPage(searchTrending);
    await settle();
    const rows = Array.from(searchBox().querySelectorAll(ROW));
    expect(rows.length).toBeGreaterThan(8);
    expect(rows.filter((row) => viewItem(row).state === 'withheld')).toEqual([]);

    // Rows as Reddit draws them, with no test id: a trending search, and a recent one scoped to a subreddit.
    const list = rows[0]!.parentElement!;
    const row = (label: string) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'presentation');
      li.innerHTML = `<a href="/search/?q=${encodeURIComponent(label)}" role="menuitem"><span><span data-type="search-dropdown-item-label-text">${label}</span></span></a>`;
      return li;
    };
    const trending = row('GTA 6 Gameplay Reveal on South Park');
    const recent = row('r/GTA6 ending');
    const other = row('Phantom Blade Zero Launch');
    list.append(trending, recent, other);
    await settle();

    expect(viewItem(trending)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
    expect(viewItem(recent)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
    expect(viewItem(other).state).toBe('shown');
  });

  it('covers what a signed-in user’s empty search box shows: recent communities and recent searches', async () => {
    renderPage(searchTrending);
    await settle();
    const results = searchBox().querySelector('#search-dropdown-results-container ul')!;
    // Shaped like Reddit's, as captured from a signed-in browser.
    const recentCommunity = (name: string) => {
      const tile = document.createElement('div');
      tile.setAttribute('data-suggested-subreddit-dismiss-item', '');
      tile.innerHTML = `<a aria-label="r/${name}" data-testid="search-sdui-typeahead-row-community-item" href="/r/${name}/" role="menuitem"><span>r/${name}</span></a><button aria-label="Remove r/${name}" type="button"></button>`;
      return tile;
    };
    const recentSearch = (label: string) => {
      const row = document.createElement('div');
      row.className = 'recent-search-item-container';
      // The query itself is drawn inside the item's own shadow root; the delete button names it.
      row.innerHTML = `<search-telemetry-tracker><recent-search-item><search-telemetry-tracker slot="dismiss-button-container"><button aria-label="Delete ${label} from recent searches"></button></search-telemetry-tracker></recent-search-item></search-telemetry-tracker>`;
      return row;
    };
    const communities = document.createElement('div');
    communities.className = 'search-sdui-typeahead-row';
    const gta6Community = recentCommunity('GTA6');
    const otherCommunity = recentCommunity('aviation');
    communities.append(gta6Community, otherCommunity);
    const gta6Search = recentSearch('r/GTA6 ending');
    const otherSearch = recentSearch('deadlock');
    results.prepend(communities, gta6Search, otherSearch);
    await settle();

    expect(viewItem(gta6Community)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
    expect(viewItem(otherCommunity).state).toBe('shown');
    expect(viewItem(gta6Search)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
    expect(viewItem(otherSearch).state).toBe('shown');
  });

  it('covers the community card about GTA 6 beside the feed', () => {
    const card = Array.from(document.querySelectorAll('community-card')).find((each) => each.textContent?.includes('r/GTA6'))!;
    expect(viewItem(card)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });
});
