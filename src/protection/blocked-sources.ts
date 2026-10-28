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

/** The id of the right-click menu entry that blocks a channel. */
export const BLOCK_MENU_ID = 'block-source';

/**
 * Blocks the source of whatever was right-clicked in a tab, as the right-click
 * menu entry does: the page knows which item it was, the background stores it.
 */
export async function blockSourceUnderPointer(tabId: number, frameId: number): Promise<void> {
  const source: unknown = await browser.tabs
    .sendMessage(tabId, { type: SOURCE_UNDER_POINTER }, { frameId })
    .catch(() => null);
  if (isBlockedSource(source)) await updateProtection((state) => blockSource(state, source));
}
