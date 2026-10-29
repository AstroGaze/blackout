import { browser } from 'wxt/browser';
import { SOURCE_UNDER_POINTER, type SourceUnderPointerRequest } from '@/protection/blocked-sources';
import type { BlockedSource } from '@/protection/state';

/**
 * Answers the background with a source of what was last right-clicked on this
 * page, for "Block this channel" and the like in the right-click menu. `sourcesOf` names the
 * sources of an element. The background can ask for one kind, such as a Reddit
 * user ("u/") rather than the subreddit. Returns a function that stops it.
 */
export function answerSourceUnderPointer(win: Window, sourcesOf: (target: Element) => BlockedSource[]): () => void {
  let underPointer: BlockedSource[] = [];
  // Capture phase, so a cover that keeps presses to itself still counts.
  const remember = (event: Event) => {
    const target = event.target as Element | null;
    underPointer = target && typeof target.closest === 'function' ? sourcesOf(target) : [];
  };
  win.document.addEventListener('contextmenu', remember, true);
  const onMessage = (message: unknown) => {
    const request = message as Partial<SourceUnderPointerRequest> | null;
    if (request?.type !== SOURCE_UNDER_POINTER) return undefined;
    const prefix = typeof request.accountPrefix === 'string' ? request.accountPrefix : '';
    return Promise.resolve(underPointer.find((source) => source.account.startsWith(prefix)) ?? null);
  };
  browser.runtime.onMessage.addListener(onMessage);
  return () => {
    win.document.removeEventListener('contextmenu', remember, true);
    browser.runtime.onMessage.removeListener(onMessage);
  };
}
