import { browser } from 'wxt/browser';
import { SOURCE_UNDER_POINTER } from '@/protection/blocked-sources';
import type { BlockedSource } from '@/protection/state';

/**
 * Answers the background with the source of what was last right-clicked on this
 * page, for "Block this channel" in the right-click menu. `sourceOf` names the
 * source of an element, or null. Returns a function that stops it.
 */
export function answerSourceUnderPointer(win: Window, sourceOf: (target: Element) => BlockedSource | null): () => void {
  let underPointer: BlockedSource | null = null;
  // Capture phase, so a cover that keeps presses to itself still counts.
  const remember = (event: Event) => {
    const target = event.target as Element | null;
    underPointer = target && typeof target.closest === 'function' ? sourceOf(target) : null;
  };
  win.document.addEventListener('contextmenu', remember, true);
  const onMessage = (message: unknown) => {
    if ((message as { type?: unknown } | null)?.type !== SOURCE_UNDER_POINTER) return undefined;
    return Promise.resolve(underPointer);
  };
  browser.runtime.onMessage.addListener(onMessage);
  return () => {
    win.document.removeEventListener('contextmenu', remember, true);
    browser.runtime.onMessage.removeListener(onMessage);
  };
}
