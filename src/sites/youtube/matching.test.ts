import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { settle, viewItem } from '@/test/page';
import { youtube } from './adapter';
import { homeFeedTile } from './fixtures/tile';

let guard: PageGuard | undefined;

beforeEach(() => {
  fakeBrowser.reset();
  document.body.replaceChildren();
  guard = startPageGuard(youtube);
});

afterEach(() => guard?.stop());

async function viewTile(title: string, channel?: string) {
  const tile = homeFeedTile(title, channel);
  document.body.append(tile);
  await settle();
  return viewItem(tile);
}

describe('matching GTA 6 Strong Terms on a tile', () => {
  it.each([
    'GTA6 leaks are everywhere',
    '#GTA6 trailer reaction',
    'gta 6 but in lowercase',
    'GTA   6 with extra spaces',
    'Is this GTA...6?!',
    'gta-6 speedrun',
    'GRAND THEFT AUTO VI',
    'Welcome to LÉONIDA',
    '#GrandTheftAutoVI hype',
    '#ViceCity is not a Strong Term but #Leonida is',
  ])('covers "%s"', async (title) => {
    expect(await viewTile(title)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it.each([
    'GTA 60 fps mods',
    'Leonidas and the 300',
    'Grand Theft Auto V remastered',
    'GTA 5 vs GTA 7',
    'Every GTA trailer ranked',
  ])('shows "%s"', async (title) => {
    expect(await viewTile(title)).toMatchObject({ state: 'shown' });
  });

  it("doesn't let a title and channel run together into one word", async () => {
    expect(await viewTile('Everything we know about Leonida', 'Fans United')).toMatchObject({
      state: 'covered',
      reason: 'GTA 6',
    });
  });
});
