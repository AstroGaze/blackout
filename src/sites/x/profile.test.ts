// @vitest-environment-options {"happyDOM": {"url": "https://x.com/"}}
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { MASKED_TITLE } from '@/guard/page-cover-guard';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { protectionState } from '@/protection/state';
import { renderPage, settle, viewPage } from '@/test/page';
import { gta6, stateWithTopics } from '@/test/state';
import { x } from './adapter';
import profileLoggedOut from './fixtures/profile-logged-out.html?raw';
import profile from './fixtures/profile.html?raw';
import { coveredTitles, shownTitles } from './fixtures/view';

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

async function open(html: string, path: string, bio?: string) {
  history.replaceState(null, '', path);
  guard = startPageGuard(x);
  // A profile whose bio says what it's about, in place of Rockstar's.
  const rockstarBio = 'The official home of Rockstar Games on X';
  expect(html).toContain(rockstarBio);
  renderPage(bio ? html.replace(rockstarBio, bio) : html);
  await settle();
}

describe.each([
  // Logged out, X wraps each post in a link, which is what gets covered.
  ['signed in', profile, 'article'],
  ['logged out', profileLoggedOut, '[role="link"][data-href*="/status/"]'],
])('an X profile, %s', (_, html, post) => {
  it('is shown when its name and bio aren’t about a topic, with its posts checked one by one', async () => {
    await open(html, '/RockstarGames');

    expect(viewPage().state).toBe('shown');
    expect(coveredTitles(post)).toEqual(expect.arrayContaining([expect.stringMatching(/^Watch the Grand Theft Auto VI Launch Trailer/)]));
    expect(shownTitles(post).length).toBeGreaterThan(0);
  });

  it('waits for its own header after navigating, rather than checking the one still on the page', async () => {
    // X has moved to another profile, but still shows Rockstar's.
    await open(html, '/GTASixInfo');

    expect(viewPage().state).toBe('hidden');
  });

  it('is checked by what it says even without tabs, as for an account that has blocked the user', async () => {
    const withoutTabs = html.replace(/role="tablist"/g, 'role="presentation"');
    await open(withoutTabs, '/RockstarGames', 'Daily GTA 6 leaks and news');

    expect(viewPage()).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('is covered as a whole when its bio is about a topic, its other tabs too', async () => {
    await open(html, '/RockstarGames', 'Daily GTA 6 leaks and news');
    expect(viewPage()).toEqual({ title: MASKED_TITLE, state: 'covered', reason: 'GTA 6' });

    guard?.stop();
    await open(html, '/RockstarGames/media', 'Daily GTA 6 leaks and news');
    expect(viewPage()).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });
});
