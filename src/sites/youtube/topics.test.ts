import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import {
  addTopic,
  addUserTerm,
  deleteTopic,
  pauseTopic,
  removeUserTerm,
  resumeTopic,
  setTopicEnabled,
  setUserTermCommonWord,
  updateProtection,
} from '@/protection/topics';
import { GTA6_PRESET, protectionState } from '@/protection/state';
import { settle } from '@/test/page';
import { gta6, stateWithTopics } from '@/test/state';
import { youtube } from './adapter';
import { homeFeedTile } from './fixtures/tile';
import { viewItem } from './fixtures/view';

const HOUR = 60 * 60 * 1000;

let guard: PageGuard | undefined;

beforeEach(() => {
  fakeBrowser.reset();
  document.body.replaceChildren();
});

afterEach(() => {
  guard?.stop();
  guard = undefined;
  vi.useRealTimers();
});

/** Opens a home feed with these tiles, as an open YouTube tab. */
async function openFeed(...titles: string[]) {
  guard = startPageGuard(youtube);
  const tiles = titles.map((title) => homeFeedTile(title));
  document.body.append(...tiles);
  await settle();
  return tiles;
}

describe('managing Protected Topics while YouTube is open', () => {
  it('protects a topic added by name straight away, with its spacing and hashtag variants', async () => {
    const tiles = await openFeed('Severance season 3 review', '#Severance theories', 'Cooking pasta');

    await updateProtection((state) => addTopic(state, 'Severance'));
    await settle();

    expect(tiles.map(viewItem)).toEqual([
      { title: 'Severance season 3 review', state: 'covered', reason: 'Severance' },
      { title: '#Severance theories', state: 'covered', reason: 'Severance' },
      { title: 'Cooking pasta', state: 'shown' },
    ]);
  });

  it('shows a topic’s Hidden Items when it is turned off, and hides them when it is turned on', async () => {
    const [tile] = await openFeed('GTA 6 trailer breakdown');
    expect(viewItem(tile!)).toMatchObject({ state: 'covered', reason: 'GTA 6' });

    await updateProtection((state) => setTopicEnabled(state, GTA6_PRESET.id, false));
    await settle();
    expect(viewItem(tile!)).toMatchObject({ state: 'shown' });

    await updateProtection((state) => setTopicEnabled(state, GTA6_PRESET.id, true));
    await settle();
    expect(viewItem(tile!)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('shows a topic’s Hidden Items when it is deleted', async () => {
    const [tile] = await openFeed('GTA 6 trailer breakdown');

    await updateProtection((state) => deleteTopic(state, GTA6_PRESET.id));
    await settle();

    expect(viewItem(tile!)).toMatchObject({ state: 'shown' });
  });

  it('keeps hiding for the other active topics', async () => {
    await protectionState.setValue(stateWithTopics(gta6()));
    await updateProtection((state) => addTopic(state, 'Severance'));
    const [gtaTile, severanceTile] = await openFeed('GTA 6 trailer breakdown', 'Severance finale');

    await updateProtection((state) => setTopicEnabled(state, GTA6_PRESET.id, false));
    await settle();

    expect([viewItem(gtaTile!), viewItem(severanceTile!)]).toEqual([
      { title: 'GTA 6 trailer breakdown', state: 'shown' },
      { title: 'Severance finale', state: 'covered', reason: 'Severance' },
    ]);
  });
});

describe('your own Related Terms', () => {
  it('hides content with a term you add straight away, as a Strong Term', async () => {
    await protectionState.setValue(stateWithTopics());
    await updateProtection((state) => addTopic(state, 'Severance'));
    const [tile, other] = await openFeed('Inside Lumon headquarters', 'Cooking pasta');
    expect(viewItem(tile!)).toMatchObject({ state: 'shown' });

    await updateProtection((state) => addUserTerm(state, 'severance', 'Lumon'));
    await settle();

    expect([viewItem(tile!), viewItem(other!)]).toEqual([
      { title: 'Inside Lumon headquarters', state: 'covered', reason: 'Severance' },
      { title: 'Cooking pasta', state: 'shown' },
    ]);
  });

  it('hides with a term marked as a common word only alongside another term of its topic', async () => {
    await protectionState.setValue(stateWithTopics());
    await updateProtection((state) => addTopic(state, 'Severance'));
    await updateProtection((state) => addUserTerm(state, 'severance', 'Mark', { commonWord: true }));
    await updateProtection((state) => addUserTerm(state, 'severance', 'Milchick', { commonWord: true }));
    const tiles = await openFeed('Mark Rober builds a dam', 'Mark confronts Milchick');

    expect(tiles.map(viewItem)).toEqual([
      { title: 'Mark Rober builds a dam', state: 'shown' },
      { title: 'Mark confronts Milchick', state: 'covered', reason: 'Severance' },
    ]);
  });

  it('hides on its own again once a common word is marked as not common', async () => {
    await protectionState.setValue(stateWithTopics());
    await updateProtection((state) => addTopic(state, 'Severance'));
    await updateProtection((state) => addUserTerm(state, 'severance', 'Lumon', { commonWord: true }));
    const [tile] = await openFeed('Inside Lumon headquarters');
    expect(viewItem(tile!)).toMatchObject({ state: 'shown' });

    await updateProtection((state) => setUserTermCommonWord(state, 'severance', 'Lumon', false));
    await settle();

    expect(viewItem(tile!)).toMatchObject({ state: 'covered', reason: 'Severance' });
  });

  it('shows content again when you remove your term', async () => {
    await protectionState.setValue(stateWithTopics());
    await updateProtection((state) => addTopic(state, 'Severance'));
    await updateProtection((state) => addUserTerm(state, 'severance', 'Lumon'));
    const [tile] = await openFeed('Inside Lumon headquarters');
    expect(viewItem(tile!)).toMatchObject({ state: 'covered', reason: 'Severance' });

    await updateProtection((state) => removeUserTerm(state, 'severance', 'Lumon'));
    await settle();

    expect(viewItem(tile!)).toMatchObject({ state: 'shown' });
  });

  it('keeps hiding with the AI’s copy of a term when you remove your own copy of it', async () => {
    const [tile] = await openFeed('Every Leonida county ranked');
    await updateProtection((state) => addUserTerm(state, GTA6_PRESET.id, 'leonida'));

    await updateProtection((state) => removeUserTerm(state, GTA6_PRESET.id, 'leonida'));
    await settle();

    expect(viewItem(tile!)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });
});

describe('when the stored protection state breaks and is then fixed', () => {
  it('hides every tile while it is broken, and checks them all again once it is fixed', async () => {
    const [gtaTile, otherTile] = await openFeed('GTA 6 trailer breakdown', 'Cooking pasta');

    await fakeBrowser.storage.local.set({ protectionState: { topics: [{ name: 'GTA 6', terms: [{ text: null }] }] } });
    await settle();
    expect([viewItem(gtaTile!).state, viewItem(otherTile!).state]).toEqual(['withheld', 'withheld']);

    await protectionState.setValue(stateWithTopics(gta6()));
    await settle();
    expect([viewItem(gtaTile!).state, viewItem(otherTile!).state]).toEqual(['covered', 'shown']);
  });
});

describe('pausing a Protected Topic', () => {
  it('shows its Hidden Items while paused, and hides them again by itself when the Pause ends', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-19T10:00:00Z') });
    const passTime = (ms: number) => vi.advanceTimersByTimeAsync(ms);
    guard = startPageGuard(youtube);
    const tile = homeFeedTile('GTA 6 ending explained');
    document.body.append(tile);
    await passTime(10);

    await updateProtection((state) => pauseTopic(state, GTA6_PRESET.id, Date.now() + HOUR));
    await passTime(10);
    expect(viewItem(tile)).toMatchObject({ state: 'shown' });

    await passTime(HOUR);
    expect(viewItem(tile)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('is over on the next visit when it ended while the browser was closed', async () => {
    await updateProtection((state) => pauseTopic(state, GTA6_PRESET.id, Date.now() - 1000));

    const [tile] = await openFeed('GTA 6 ending explained');

    expect(viewItem(tile!)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('hides its Hidden Items again when resumed early', async () => {
    const [tile] = await openFeed('GTA 6 ending explained');
    await updateProtection((state) => pauseTopic(state, GTA6_PRESET.id, Date.now() + HOUR));
    await settle();

    await updateProtection((state) => resumeTopic(state, GTA6_PRESET.id));
    await settle();

    expect(viewItem(tile!)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });
});
