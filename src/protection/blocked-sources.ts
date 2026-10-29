// Blocked Sources: accounts whose content is always hidden. Pages ask the
// background to block or unblock one, so every change goes through the lock the
// extension's own pages share (content scripts run with the site's locks).

import { browser } from 'wxt/browser';
import type { BlockedSource, ProtectionState, SourceId } from './state';
import { updateProtection } from './topics';

export function sameSource(a: SourceId, b: SourceId): boolean {
  return a.site === b.site && a.account === b.account;
}

export function isBlocked(state: ProtectionState, source: SourceId): boolean {
  return state.blockedSources.some((blocked) => sameSource(blocked, source));
}

/** Adds a Blocked Source, once. */
export function blockSource(state: ProtectionState, source: BlockedSource): ProtectionState {
  if (isBlocked(state, source)) return state;
  return { ...state, blockedSources: [...state.blockedSources, source] };
}

export function unblockSource(state: ProtectionState, source: SourceId): ProtectionState {
  return { ...state, blockedSources: state.blockedSources.filter((blocked) => !sameSource(blocked, source)) };
}

/** The message that asks a page which source was last right-clicked on it. */
export const SOURCE_UNDER_POINTER = 'source-under-pointer';

export interface SourceUnderPointerRequest {
  type: typeof SOURCE_UNDER_POINTER;
  /** Only a source whose account starts with this, such as "u/" for a Reddit user. */
  accountPrefix?: string;
}

/** What a page asks the background to do with a source. */
const CHANGES = { 'block-source': blockSource, 'unblock-source': unblockSource } as const;

interface SourceChange {
  type: keyof typeof CHANGES;
  source: BlockedSource;
}

/** Asks the background to block a source, from a page. */
export async function requestBlock(source: BlockedSource): Promise<void> {
  await browser.runtime.sendMessage({ type: 'block-source', source } satisfies SourceChange);
}

/** Asks the background to unblock a source, from a page. */
export async function requestUnblock(source: BlockedSource): Promise<void> {
  await browser.runtime.sendMessage({ type: 'unblock-source', source } satisfies SourceChange);
}

function isBlockedSource(value: unknown): value is BlockedSource {
  const source = value as Partial<BlockedSource> | null;
  return (
    typeof source?.site === 'string' && typeof source.account === 'string' && source.account !== '' && typeof source.name === 'string'
  );
}

/** Stores the blocks and unblocks pages ask for. Returns a function that stops it. */
export function listenForSourceRequests(): () => void {
  const onMessage = (message: unknown) => {
    const request = message as Partial<SourceChange> | null;
    const change = request?.type && Object.hasOwn(CHANGES, request.type) ? CHANGES[request.type] : null;
    const source = request?.source;
    if (change && isBlockedSource(source)) void updateProtection((state) => change(state, source));
  };
  browser.runtime.onMessage.addListener(onMessage);
  return () => browser.runtime.onMessage.removeListener(onMessage);
}

/**
 * The right-click menu entries that block a source, on the sites each belongs to.
 * YouTube's keeps the id it had when it was the only one.
 */
export const BLOCK_MENU_ENTRIES = [
  { id: 'block-source', title: 'Block this channel', sites: ['*://www.youtube.com/*'], accountPrefix: '' },
  { id: 'block-subreddit', title: 'Block this subreddit', sites: ['*://www.reddit.com/*'], accountPrefix: 'r/' },
  { id: 'block-reddit-user', title: 'Block this user', sites: ['*://www.reddit.com/*'], accountPrefix: 'u/' },
] as const;

/**
 * Blocks the source of whatever was right-clicked in a tab, as the right-click
 * menu entries do: the page knows which item it was, the background stores it.
 * `accountPrefix` picks one kind of source, such as "u/" for a Reddit user.
 */
export async function blockSourceUnderPointer(tabId: number, frameId: number, accountPrefix = ''): Promise<void> {
  const request: SourceUnderPointerRequest = { type: SOURCE_UNDER_POINTER, accountPrefix };
  const source: unknown = await browser.tabs.sendMessage(tabId, request, { frameId }).catch(() => null);
  if (isBlockedSource(source)) await updateProtection((state) => blockSource(state, source));
}
