// Suggested Blocks: when 3 items from one source are hidden for one topic in a
// day, Blackout offers to block the source. Nothing is blocked without a click.
//
// The counts live apart from the protection state: they change with every Hidden
// Item, and a change to the protection state makes every open page check all its
// items again. Only the background writes them, one change at a time.

import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';
import { isBlocked, sameSource } from './blocked-sources';
import { isTopicActive, protectionState, type BlockedSource, type ProtectionState, type Site, type SourceId } from './state';

/** How many of a source's items hidden for one topic in one day bring a Suggested Block. */
export const SUGGEST_AT = 3;

/** What accepting a Suggested Block is called on each site. */
export const ACCEPT_LABELS: Record<Site, string> = { youtube: 'Block channel', reddit: 'Block', x: 'Block account' };

/** The items one source had hidden for one topic today. */
export interface SourceTally {
  source: BlockedSource;
  topicId: string;
  topicName: string;
  /** The Hidden Items, by what they show (a video), so each counts once. */
  itemKeys: string[];
  /** Whether the source was dismissed ("Not now") or blocked today; it isn't suggested again today. */
  dismissed: boolean;
}

export interface SuggestedBlockCounts {
  /** The local day the tallies are for, as "2026-11-19". */
  day: string;
  tallies: Record<string, SourceTally>;
}

export const suggestedBlockCounts = storage.defineItem<SuggestedBlockCounts>('local:suggestedBlockCounts', {
  fallback: { day: '', tallies: {} },
});

/** The local day `now` falls on, as "2026-11-19". */
export function dayOf(now = Date.now()): string {
  const date = new Date(now);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** An item hidden for a topic, as a page reports it. */
export interface HiddenItem {
  source: BlockedSource;
  topicId: string;
  topicName: string;
  /** What the item shows, such as a video's id, so it counts once however often it is seen. */
  itemKey: string;
}

function tallyKey(source: SourceId, topicId: string): string {
  return `${source.site} ${source.account} ${topicId}`;
}

/** The counts for today, starting afresh on a new day. */
function forToday(counts: SuggestedBlockCounts, now: number): SuggestedBlockCounts {
  const day = dayOf(now);
  return counts.day === day ? counts : { day, tallies: {} };
}

export function countHiddenItem(counts: SuggestedBlockCounts, item: HiddenItem, now = Date.now()): SuggestedBlockCounts {
  const today = forToday(counts, now);
  const key = tallyKey(item.source, item.topicId);
  const tally: SourceTally = today.tallies[key] ?? {
    source: item.source,
    topicId: item.topicId,
    topicName: item.topicName,
    itemKeys: [],
    // A source dismissed or blocked earlier today stays quiet for any topic.
    dismissed: Object.values(today.tallies).some((other) => other.dismissed && sameSource(other.source, item.source)),
  };
  if (tally.itemKeys.includes(item.itemKey)) return today;
  return { ...today, tallies: { ...today.tallies, [key]: { ...tally, itemKeys: [...tally.itemKeys, item.itemKey] } } };
}

/** Stops suggesting a source, for every topic, for the rest of the day. */
export function dismissSuggestedBlock(counts: SuggestedBlockCounts, source: SourceId, now = Date.now()): SuggestedBlockCounts {
  const today = forToday(counts, now);
  const tallies = Object.fromEntries(
    Object.entries(today.tallies).map(([key, tally]) => [
      key,
      sameSource(tally.source, source) ? { ...tally, dismissed: true } : tally,
    ]),
  );
  return { ...today, tallies };
}

/** A Suggested Block waiting for the user's answer. */
export interface SuggestedBlock {
  source: BlockedSource;
  topicName: string;
  count: number;
}

/**
 * The Suggested Blocks waiting today: a source with enough Hidden Items for an
 * active topic, not yet blocked or dismissed. One per source.
 */
export function pendingSuggestedBlocks(
  counts: SuggestedBlockCounts,
  state: ProtectionState,
  now = Date.now(),
): SuggestedBlock[] {
  if (counts.day !== dayOf(now)) return [];
  const pending: SuggestedBlock[] = [];
  for (const tally of Object.values(counts.tallies)) {
    if (tally.itemKeys.length < SUGGEST_AT || tally.dismissed || isBlocked(state, tally.source)) continue;
    const topic = state.topics.find((candidate) => candidate.id === tally.topicId);
    if (!topic || !isTopicActive(topic, now)) continue;
    if (pending.some((other) => sameSource(other.source, tally.source))) continue;
    pending.push({ source: tally.source, topicName: topic.name, count: tally.itemKeys.length });
  }
  return pending;
}

type CountRequest = { type: 'hidden-item'; item: HiddenItem } | { type: 'dismiss-suggested-block'; source: SourceId };

/** Tells the background an item was hidden for a topic, from a page. */
export async function reportHiddenItem(item: HiddenItem): Promise<void> {
  await browser.runtime.sendMessage({ type: 'hidden-item', item } satisfies CountRequest);
}

/** Asks the background to stop suggesting a source today, from a page or the popup. */
export async function requestDismiss(source: SourceId): Promise<void> {
  const request: CountRequest = { type: 'dismiss-suggested-block', source: { site: source.site, account: source.account } };
  await browser.runtime.sendMessage(request);
}

/**
 * Counts the Hidden Items pages report, and dismissals. A source that gets
 * blocked, however, is settled for the day too, so unblocking it later doesn't
 * bring the suggestion straight back. Returns a function that stops it.
 */
export function listenForHiddenItems(): () => void {
  let pending: Promise<unknown> = Promise.resolve();
  const update = (change: (counts: SuggestedBlockCounts) => SuggestedBlockCounts) => {
    pending = pending
      .then(async () => suggestedBlockCounts.setValue(change(await suggestedBlockCounts.getValue())))
      .catch((error) => console.error('[Blackout] Could not count a Hidden Item', error));
  };
  const onMessage = (message: unknown) => {
    const request = message as Partial<CountRequest> | null;
    if (request?.type === 'hidden-item' && isHiddenItem(request.item)) {
      const item = request.item;
      update((counts) => countHiddenItem(counts, item));
    } else if (request?.type === 'dismiss-suggested-block' && isSourceId(request.source)) {
      const source = request.source;
      update((counts) => dismissSuggestedBlock(counts, source));
    }
  };
  browser.runtime.onMessage.addListener(onMessage);
  const stopWatching = protectionState.watch((next, previous) => {
    for (const source of next?.blockedSources ?? []) {
      if (!previous?.blockedSources.some((blocked) => sameSource(blocked, source))) {
        update((counts) => dismissSuggestedBlock(counts, source));
      }
    }
  });
  return () => {
    browser.runtime.onMessage.removeListener(onMessage);
    stopWatching();
  };
}

function isSourceId(value: unknown): value is SourceId {
  const source = value as Partial<SourceId> | null;
  return typeof source?.site === 'string' && typeof source.account === 'string';
}

function isHiddenItem(value: unknown): value is HiddenItem {
  const item = value as Partial<HiddenItem> | null;
  return (
    isSourceId(item?.source) &&
    typeof item.source.name === 'string' &&
    typeof item.topicId === 'string' &&
    typeof item.topicName === 'string' &&
    typeof item.itemKey === 'string'
  );
}
