import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { clickCoverButton, isKeyboardReachable, settle } from '@/test/page';
import { viewItem } from './fixtures/view';
import { youtube } from './adapter';
import { homeFeedTile } from './fixtures/tile';

const TITLE = 'GTA 6 ending explained';

let guard: PageGuard | undefined;

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => guard?.stop());

async function openPageWithTile(): Promise<Element> {
  guard?.stop();
  document.body.replaceChildren();
  guard = startPageGuard(youtube);
  const tile = homeFeedTile(TITLE);
  document.body.append(tile);
  await settle();
  return tile;
}

async function revealedTile(): Promise<Element> {
  const tile = await openPageWithTile();
  clickCoverButton(tile, 'Reveal');
  await settle();
  clickCoverButton(tile, 'Show');
  await settle();
  return tile;
}

describe('revealing a Hidden Item', () => {
  it('shows the tile only after the reveal is confirmed', async () => {
    const tile = await openPageWithTile();

    clickCoverButton(tile, 'Reveal');
    await settle();
    expect(viewItem(tile)).toMatchObject({ state: 'covered', reason: 'GTA 6' });

    clickCoverButton(tile, 'Show');
    await settle();
    expect(viewItem(tile)).toEqual({ title: TITLE, state: 'shown' });
  });

  it("doesn't let the keyboard reach the covered tile's links until revealed", async () => {
    const tile = await openPageWithTile();
    const link = tile.querySelector('h3 a')!;
    expect(isKeyboardReachable(link)).toBe(false);

    clickCoverButton(tile, 'Reveal');
    await settle();
    clickCoverButton(tile, 'Show');
    await settle();

    expect(isKeyboardReachable(link)).toBe(true);
  });

  it('keeps the tile covered when the reveal is cancelled', async () => {
    const tile = await openPageWithTile();

    clickCoverButton(tile, 'Reveal');
    await settle();
    clickCoverButton(tile, 'Cancel');
    await settle();

    expect(viewItem(tile)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
    expect(() => clickCoverButton(tile, 'Show')).toThrow();
  });

  it('stays revealed while YouTube redraws the same video, as on a hover preview', async () => {
    const tile = await revealedTile();

    const preview = document.createElement('span');
    preview.textContent = 'Keep hovering to play';
    tile.querySelector('yt-lockup-view-model')!.append(preview);
    await settle();

    expect(viewItem(tile)).toEqual({ title: TITLE, state: 'shown' });
  });

  it('checks again when YouTube reuses the revealed tile for another video', async () => {
    const tile = await revealedTile();

    tile.querySelector('h3 a')!.setAttribute('href', '/watch?v=another');
    tile.querySelector('h3 span')!.textContent = 'GTA 6 final mission';
    await settle();

    expect(viewItem(tile)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('lasts for that page view only', async () => {
    await revealedTile();

    const tileAfterReload = await openPageWithTile();

    expect(viewItem(tileAfterReload)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });
});
