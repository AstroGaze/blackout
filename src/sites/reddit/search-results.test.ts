// @vitest-environment-options {"happyDOM": {"url": "https://www.reddit.com/"}}
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { protectionState } from '@/protection/state';
import { readableText, renderPage, settle } from '@/test/page';
import { gta6, stateWithTopics } from '@/test/state';
import { reddit } from './adapter';
import searchComments from './fixtures/search-comments.html?raw';
import searchMedia from './fixtures/search-media.html?raw';
import searchResults from './fixtures/search-results.html?raw';
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

describe('Reddit search results for "gta 6"', () => {
  it('leaves nothing that names GTA 6 readable among the posts, related searches, answers, communities and people', async () => {
    await open(searchResults, '/search/?q=gta+6');

    expect(readableText(NAMES_GTA6, { ignore: SCREEN_READER_ONLY })).toEqual([]);
    const post = document.querySelector('[data-testid="search-post-unit"]')!;
    expect(viewItem(post.closest('[data-blackout]') ?? post).state).not.toBe('withheld');
  });

  it('checks every result, rather than leaving any hidden unchecked', async () => {
    await open(searchResults, '/search/?q=gta+6');

    const results = Array.from(document.querySelectorAll('[data-testid="search-post-unit"], [data-testid="search-community"]'));
    expect(results.length).toBeGreaterThan(5);
    expect(results.map((result) => viewItem(result.closest('[data-blackout]:not([data-blackout="nested"])') ?? result).state)).not.toContain(
      'withheld',
    );
  });

  it('shows a result that isn’t about GTA 6', async () => {
    await open(searchResults, '/search/?q=gta+6');
    const result = document.querySelector('[data-testid="search-post-unit"]')!;
    const other = result.cloneNode(true) as Element;
    // A copy of it about something else: no GTA anywhere in it, and none of Blackout's marks.
    other.querySelector('blackout-cover')?.remove();
    for (const element of [other, ...other.querySelectorAll('*')]) {
      element.removeAttribute('data-blackout');
      element.removeAttribute('inert');
      if (element.children.length === 0 && /gta/i.test(element.textContent ?? '')) element.textContent = 'Best pizza in Naples';
    }
    result.parentElement!.append(other);
    await settle();

    expect(viewItem(other).state).toBe('shown');
  });

  it('leaves nothing readable among comment results', async () => {
    await open(searchComments, '/search/?q=gta+6&type=comments');

    expect(readableText(NAMES_GTA6, { ignore: SCREEN_READER_ONLY })).toEqual([]);
  });

  it('leaves nothing readable among media results', async () => {
    await open(searchMedia, '/search/?q=gta+6&type=media');

    expect(readableText(NAMES_GTA6, { ignore: SCREEN_READER_ONLY })).toEqual([]);
  });
});
