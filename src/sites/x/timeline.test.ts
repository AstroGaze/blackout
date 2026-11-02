// @vitest-environment-options {"happyDOM": {"url": "https://x.com/"}}
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { protectionState } from '@/protection/state';
import { isKeyboardReachable, readableText, renderPage, settle, viewPage } from '@/test/page';
import { gta6, stateWithTopics } from '@/test/state';
import { x } from './adapter';
import homeTimeline from './fixtures/home-timeline.html?raw';
import { xPost, xTrend } from './fixtures/post';
import { coveredTitles, shownTitles, viewItem } from './fixtures/view';

const POST = 'article';

let guard: PageGuard | undefined;

beforeEach(async () => {
  fakeBrowser.reset();
  document.body.replaceChildren();
  await protectionState.setValue(stateWithTopics(gta6()));
  history.replaceState(null, '', '/home');
  guard = startPageGuard(x);
  renderPage(homeTimeline);
  await settle();
});

afterEach(() => {
  guard?.stop();
  guard = undefined;
});

const timeline = () => document.querySelector('[data-testid="cellInnerDiv"]')!.parentElement!;
const sidebar = () => document.querySelector('[data-testid="sidebarColumn"]')!;

describe('the X home timeline with the ready-made GTA 6 topic', () => {
  it('covers the post about GTA 6 and shows the rest, leaving nothing naming GTA 6 readable', () => {
    expect(coveredTitles(POST)).toEqual([expect.stringMatching(/^Walmart GTA 6 Preorders Will Get a 'Surprise and D/)]);
    expect(shownTitles(POST)).toHaveLength(5);
    expect(viewPage()).toMatchObject({ state: 'shown' });
    expect(readableText(/\bgta ?(6|vi)\b|\bgta6\b|grand theft auto (vi|6)\b|\bleonida\b/i)).toEqual([]);
  });

  it('checks posts that arrive as the timeline scrolls', async () => {
    const posts = [xPost('Leonida map leaked'), xPost('The ending of GTA VI is that…'), xPost('My cat sleeping')];
    timeline().append(...posts);
    await settle();

    expect(posts.map((post) => viewItem(post).state)).toEqual(['covered', 'covered', 'shown']);
    expect(isKeyboardReachable(posts[0]!.querySelector('[data-testid="tweetText"]')!)).toBe(false);
  });

  it('covers a post quoting one about GTA 6, whatever the post itself says', async () => {
    const post = xPost('lmao no way', { quoted: { text: 'GTA 6 final mission leaked', author: 'leaks' } });
    timeline().append(post);
    await settle();

    expect(viewItem(post)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('covers a post from an account whose name says GTA 6', async () => {
    const post = xPost('This is huge', { author: 'GTASixInfo', name: 'GTA 6 Info' });
    timeline().append(post);
    await settle();

    expect(viewItem(post)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('shows a post with only a Weak Term', async () => {
    const post = xPost('Jason looks different now');
    timeline().append(post);
    await settle();

    expect(viewItem(post).state).toBe('shown');
  });

  it('covers trends, suggested accounts and live broadcasts beside the timeline that are about GTA 6', async () => {
    const trends = sidebar().querySelector('[data-testid="trend"]')!.parentElement!;
    const trend = xTrend('#GTA6');
    trends.append(trend);
    const account = sidebar().querySelector('[data-testid="UserCell"]')!;
    account.querySelector('a[href^="/"] span')!.textContent = 'GTA 6 Leaks';
    const live = sidebar().querySelector('[data-testid="placementTracking"]')!;
    live.querySelector('button')!.append(' GTA 6 launch countdown');
    await settle();

    expect(viewItem(trend)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
    expect(viewItem(account)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
    expect(viewItem(live)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
    expect(shownTitles('[data-testid="trend"]')).toEqual(expect.arrayContaining([expect.stringContaining('Dragon Ball')]));
  });
});
