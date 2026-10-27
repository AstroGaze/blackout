import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { protectionState, type ProtectionState } from '@/protection/state';
import { settle, viewItem } from '@/test/page';
import { gta6, stateWithTopics, topic } from '@/test/state';
import { youtube } from './adapter';
import { homeFeedTile } from './fixtures/tile';

let guard: PageGuard | undefined;

beforeEach(() => {
  fakeBrowser.reset();
  document.body.replaceChildren();
});

afterEach(() => {
  guard?.stop();
  guard = undefined;
});

/** Opens a page holding one tile and returns what the user sees of it. */
async function viewTile(title: string, options: { channel?: string; state?: ProtectionState } = {}) {
  guard?.stop();
  document.body.replaceChildren();
  if (options.state) await protectionState.setValue(options.state);
  guard = startPageGuard(youtube);
  const tile = homeFeedTile(title, options.channel);
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
    expect(
      await viewTile('Everything we know about Leonida', { channel: 'Fans United' }),
    ).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });
});

describe('matching GTA 6 Weak Terms on a tile', () => {
  it.each([
    'Jason Statham in his best action scenes',
    'Lucia di Lammermoor, full opera',
    'Vice City soundtrack, 20 years later',
    'Jason vs Freddy, but Jason wins again',
  ])('shows "%s", where the Weak Term is alone', async (title) => {
    expect(await viewTile(title)).toMatchObject({ state: 'shown' });
  });

  it.each([
    'Jason and Lucia are the new Bonnie and Clyde',
    'Lucia breaks out of prison in Vice City',
    'Jason drives across Leonida',
  ])('covers "%s", where it appears with another GTA 6 term', async (title) => {
    expect(await viewTile(title)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('counts a Weak Term in the channel name too', async () => {
    expect(await viewTile('Lucia full story', { channel: 'Vice City Daily' })).toMatchObject({
      state: 'covered',
      reason: 'GTA 6',
    });
  });
});

describe('word boundaries, accents and other languages', () => {
  it('shows "Jasonville meets Lucia": a longer word is not the Weak Term', async () => {
    expect(await viewTile('Jasonville meets Lucia')).toMatchObject({ state: 'shown' });
  });

  it('shows a Weak Term repeated on its own, as in "Lucia, Lucia, Lucia!"', async () => {
    expect(await viewTile('Lucia, Lucia, Lucia!')).toMatchObject({ state: 'shown' });
  });

  it('matches accented text against an unaccented term', async () => {
    expect(await viewTile('Jason y Lucía, la historia completa')).toMatchObject({
      state: 'covered',
      reason: 'GTA 6',
    });
  });

  it('matches unaccented text against an accented term', async () => {
    const state = stateWithTopics(topic('Money Heist', { strong: ['Ángel Rubio'] }));
    expect(await viewTile('angel rubio is back', { state })).toMatchObject({
      state: 'covered',
      reason: 'Money Heist',
    });
  });

  it('counts a Weak Term and its hashtag spelling as one term', async () => {
    const state = stateWithTopics(topic('GTA 6', { weak: ['Vice City', '#ViceCity'] }));
    expect(await viewTile('#ViceCity soundtrack', { state })).toMatchObject({ state: 'shown' });
  });

  it('counts accented and unaccented spellings of a Weak Term as one term', async () => {
    const state = stateWithTopics(topic('GTA 6', { weak: ['Lucia', 'Lucía'] }));
    expect(await viewTile('Lucía', { state })).toMatchObject({ state: 'shown' });
  });

  it('matches terms written in Cyrillic', async () => {
    const state = stateWithTopics(topic('The Witcher', { strong: ['Цири'], language: 'ru' }));
    expect(await viewTile('ЦИРИ вернулась!', { state })).toMatchObject({
      state: 'covered',
      reason: 'The Witcher',
    });
  });

  it('matches Japanese terms inside text that has no spaces between words', async () => {
    const state = stateWithTopics(topic('GTA 6', { strong: ['グラセフ6'], language: 'ja' }));
    expect(await viewTile('新作グラセフ6の発売日が決定', { state })).toMatchObject({
      state: 'covered',
      reason: 'GTA 6',
    });
  });

  it("doesn't match a Japanese term against a different number", async () => {
    const state = stateWithTopics(topic('GTA 6', { strong: ['グラセフ6'], language: 'ja' }));
    expect(await viewTile('グラセフ5の思い出', { state })).toMatchObject({ state: 'shown' });
  });
});

describe('several Protected Topics', () => {
  const severance = topic('Severance', { strong: ['Lumon'], weak: ['Mark', 'Helly'] });
  const gta6AndSeverance = () => stateWithTopics(gta6(), severance);

  it.each([
    ['A tour of Lumon Industries', 'Severance'],
    ['GTA 6 map size compared', 'GTA 6'],
    ['Mark and Helly finally escape', 'Severance'],
  ])('labels "%s" with the topic that matched, %s', async (title, topicName) => {
    expect(await viewTile(title, { state: gta6AndSeverance() })).toMatchObject({
      state: 'covered',
      reason: topicName,
    });
  });

  it('shows Weak Terms from different topics together, as in "Mark meets Jason"', async () => {
    expect(await viewTile('Mark meets Jason', { state: gta6AndSeverance() })).toMatchObject({
      state: 'shown',
    });
  });

  it('ignores a switched-off topic', async () => {
    const state = stateWithTopics({ ...gta6(), enabled: false }, severance);
    expect(await viewTile('GTA 6 trailer breakdown', { state })).toMatchObject({ state: 'shown' });
  });

  it('keeps hiding for the topics still switched on', async () => {
    const state = stateWithTopics({ ...gta6(), enabled: false }, severance);
    expect(await viewTile('A tour of Lumon Industries', { state })).toMatchObject({
      state: 'covered',
      reason: 'Severance',
    });
  });

  it("still counts a Strong Term inside another topic's longer term", async () => {
    const state = stateWithTopics(gta6(), topic('Hurricane Season', { weak: ['Leonida Keys'] }));
    expect(await viewTile('Leonida Keys travel guide', { state })).toMatchObject({
      state: 'covered',
      reason: 'GTA 6',
    });
  });

  it("still pairs Weak Terms when one sits inside another topic's longer term", async () => {
    const state = stateWithTopics(gta6(), topic('Bourne', { weak: ['Jason Bourne'] }));
    expect(await viewTile('Jason Bourne vs Lucia', { state })).toMatchObject({
      state: 'covered',
      reason: 'GTA 6',
    });
  });

  it('labels an item that matches two topics with the first topic in the list', async () => {
    const state = stateWithTopics(gta6(), topic('Hurricane Season', { strong: ['Leonida Keys'] }));
    expect(await viewTile('Leonida Keys travel guide', { state })).toMatchObject({
      state: 'covered',
      reason: 'GTA 6',
    });
  });
});
