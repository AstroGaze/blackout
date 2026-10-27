import { COVER_TAG, mountCover, unmountCover } from '@/cover/mount';
import { compileMatcher, type HideReason, type Matcher } from '@/matcher/matcher';
import { protectionState } from '@/protection/state';
import type { SiteAdapter } from '@/sites/adapter';

export interface PageGuard {
  stop(): void;
}

/**
 * Item states, kept in a data attribute the hide-first stylesheet reads.
 * No attribute means the item hasn't passed a check yet, so it stays hidden.
 */
const STATE_ATTRIBUTE = 'data-blackout';
type ItemState = 'clean' | 'covered' | 'revealed';

function hideFirstCss(selector: string): string {
  const items = `:is(${selector})`;
  return `
${items}:not([${STATE_ATTRIBUTE}]) { visibility: hidden !important; }
${items}[${STATE_ATTRIBUTE}="covered"] { position: relative !important; overflow: hidden !important; }
${items}[${STATE_ATTRIBUTE}="covered"] > :not(${COVER_TAG}) {
  filter: blur(24px) !important;
  pointer-events: none !important;
  user-select: none !important;
}`;
}

/** Keeps focus and screen readers out of a covered item's own content. */
function setContentInert(item: Element, inert: boolean) {
  for (const child of item.children) {
    if (child.localName === COVER_TAG) continue;
    child.toggleAttribute('inert', inert);
  }
}

function setState(item: Element, state: ItemState | null) {
  if (state === null) item.removeAttribute(STATE_ATTRIBUTE);
  else item.setAttribute(STATE_ATTRIBUTE, state);
  setContentInert(item, state === 'covered');
}

/**
 * Hides every item the adapter declares from first paint, checks each one as it
 * arrives or changes, and only shows items that pass. Anything that can't be
 * checked stays hidden.
 */
export function startPageGuard(adapter: SiteAdapter): PageGuard {
  const selector = adapter.itemSelectors.join(', ');

  const style = document.createElement('style');
  style.textContent = hideFirstCss(selector);
  document.documentElement.append(style);

  let matcher: Matcher | null = null;
  const awaitingMatcher = new Set<Element>();
  /** The text each item had when it was last checked, to skip unchanged items. */
  const checkedText = new WeakMap<Element, string>();
  /** Items revealed during this page view, with the content key they had then. */
  const revealedKeys = new WeakMap<Element, string>();
  const contentKey = (item: Element, text: string) => adapter.itemKey(item) ?? text;

  const withhold = (item: Element) => {
    checkedText.delete(item);
    unmountCover(item);
    setState(item, null);
  };

  const show = (item: Element, state: 'clean' | 'revealed') => {
    unmountCover(item);
    setState(item, state);
  };

  const cover = (item: Element, reason: HideReason, key: string) => {
    setState(item, 'covered');
    mountCover(item, {
      topicName: reason.topicName,
      onReveal: () => {
        revealedKeys.set(item, key);
        show(item, 'revealed');
      },
    });
  };

  const check = (item: Element) => {
    if (!matcher) {
      awaitingMatcher.add(item);
      return;
    }
    try {
      const text = adapter.itemText(item);
      if (checkedText.get(item) === text) {
        // The site may have added content to a covered item without changing its text.
        if (item.getAttribute(STATE_ATTRIBUTE) === 'covered') setContentInert(item, true);
        return;
      }
      checkedText.set(item, text);
      if (text.trim() === '') return withhold(item);
      const key = contentKey(item, text);
      if (revealedKeys.get(item) === key) return show(item, 'revealed');
      const verdict = matcher.check({ text });
      if (verdict.hide) cover(item, verdict.reason, key);
      else show(item, 'clean');
    } catch (error) {
      console.error('[Blackout] Check failed, keeping item hidden', error);
      withhold(item);
    }
  };

  const itemsAffectedBy = (records: MutationRecord[]): Set<Element> => {
    const items = new Set<Element>();
    for (const record of records) {
      const target =
        record.target.nodeType === Node.ELEMENT_NODE
          ? (record.target as Element)
          : record.target.parentElement;
      const enclosing = target?.closest(selector);
      if (enclosing) items.add(enclosing);
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const element = node as Element;
        if (element.matches(selector)) items.add(element);
        for (const item of element.querySelectorAll(selector)) items.add(item);
      }
    }
    return items;
  };

  const observer = new MutationObserver((records) => {
    for (const item of itemsAffectedBy(records)) check(item);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  for (const item of document.querySelectorAll(selector)) awaitingMatcher.add(item);

  let stopped = false;
  protectionState
    .getValue()
    .then((state) => {
      if (stopped) return;
      matcher = compileMatcher(state);
      for (const item of awaitingMatcher) if (item.isConnected) check(item);
      awaitingMatcher.clear();
    })
    .catch((error) => {
      // Without a matcher nothing passes a check, so everything stays hidden.
      console.error('[Blackout] Could not load protection state', error);
    });

  return {
    stop() {
      stopped = true;
      observer.disconnect();
      style.remove();
    },
  };
}
