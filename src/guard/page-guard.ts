import { COVER_TAG, mountCover, unmountCover } from '@/cover/mount';
import { compileMatcher, type HideReason, type Matcher } from '@/matcher/matcher';
import { protectionState } from '@/protection/state';
import type { CoverLayout, SiteAdapter } from '@/sites/adapter';
import { inheritPageContext, sharePageContext } from './frame-context';
import { holdMedia, holdMediaIn, releaseMediaIn } from './media';
import { guardPageCover, PAGE_STATE_ATTRIBUTE } from './page-cover-guard';

export interface PageGuard {
  stop(): void;
}

/**
 * Item states, kept in a data attribute the hide-first stylesheet reads.
 * No attribute means the item hasn't passed a check yet, so it stays hidden.
 * "nested" marks an item inside another one, which is checked as part of it.
 */
const STATE_ATTRIBUTE = 'data-blackout';
type ItemState = 'clean' | 'covered' | 'revealed' | 'nested';

/** Plain selector lists rather than :is(), which some engines evaluate unreliably. */
function hideFirstCss(selectors: string[]): string {
  const each = (suffix: string) => selectors.map((selector) => selector + suffix).join(',\n');
  const covered = `[${STATE_ATTRIBUTE}="covered"]`;
  return `
${each(`:not([${STATE_ATTRIBUTE}])`)} { visibility: hidden !important; }
${each(covered)} { position: relative !important; overflow: hidden !important; }
${each(`${covered} > :not(${COVER_TAG})`)} {
  filter: blur(24px) !important;
  pointer-events: none !important;
  user-select: none !important;
}
html[${PAGE_STATE_ATTRIBUTE}] body { visibility: hidden !important; }`;
}

/** Keeps focus and screen readers out of a covered item's own content. */
function setContentInert(item: Element, inert: boolean) {
  for (const child of item.children) {
    if (child.localName === COVER_TAG) continue;
    child.toggleAttribute('inert', inert);
  }
}

function isShown(item: Element) {
  const state = item.getAttribute(STATE_ATTRIBUTE);
  return state === 'clean' || state === 'revealed';
}

function setState(item: Element, state: ItemState | null) {
  if (state === null) item.removeAttribute(STATE_ATTRIBUTE);
  else item.setAttribute(STATE_ATTRIBUTE, state);
  setContentInert(item, state === 'covered');
}

/**
 * Hides every item the adapter declares from first paint, checks each one as it
 * arrives or changes, and only shows items that pass. Anything that can't be
 * checked stays hidden. A page that is about a Protected Topic as a whole gets
 * the full-page cover.
 */
export function startPageGuard(
  adapter: SiteAdapter,
  win: Window & typeof globalThis = window,
): PageGuard {
  const doc = win.document;
  const selectors = adapter.itemKinds.map((kind) => kind.selector);
  const selector = selectors.join(', ');
  const kindOf = (item: Element) => adapter.itemKinds.find((kind) => item.matches(kind.selector));
  const coverLayoutOf = (item: Element): CoverLayout => kindOf(item)?.cover ?? 'card';
  const isMirror = (item: Element) => kindOf(item)?.mirrors === true;
  /** The item an element belongs to: the outermost one, when items nest. */
  const itemOf = (element: Element): Element | null => {
    let item = element.closest(selector);
    for (let outer = item?.parentElement?.closest(selector); outer; outer = outer.parentElement?.closest(selector)) {
      item = outer;
    }
    return item;
  };

  const style = doc.createElement('style');
  style.textContent = hideFirstCss(selectors);
  doc.documentElement.append(style);

  let matcher: Matcher | null = null;
  const awaitingMatcher = new Set<Element>();
  /** The text each item had when it was last checked, to skip unchanged items. */
  const checkedText = new WeakMap<Element, string>();
  /** Items revealed during this page view, with the content key they had then. */
  const revealedKeys = new WeakMap<Element, string>();
  /** Why each covered item is covered, so a mirror of it can say the same. */
  const coverReasons = new WeakMap<Element, HideReason>();
  const contentKey = (item: Element, text: string) => adapter.itemKey(item) ?? text;

  /**
   * Keeps a mirror (a hover preview) as hidden as the item it shows, and lets it
   * show what the user revealed. Returns false when its own check should decide.
   */
  const checkMirror = (mirror: Element, key: string): boolean => {
    const sources = Array.from(doc.querySelectorAll(selector)).filter(
      (item) => item !== mirror && !isMirror(item) && itemOf(item) === item && adapter.itemKey(item) === key,
    );
    if (sources.some((source) => source.getAttribute(STATE_ATTRIBUTE) === 'revealed')) {
      show(mirror, 'revealed');
      return true;
    }
    const hidden = sources.find((source) => !isShown(source));
    if (!hidden) return false;
    const reason = coverReasons.get(hidden);
    if (reason && hidden.getAttribute(STATE_ATTRIBUTE) === 'covered') cover(mirror, reason, key);
    else withhold(mirror);
    return true;
  };
  const recheckMirrors = () => {
    for (const kind of adapter.itemKinds.filter((candidate) => candidate.mirrors)) {
      for (const mirror of doc.querySelectorAll(kind.selector)) {
        checkedText.delete(mirror);
        check(mirror);
      }
    }
  };

  /** Checks every item again, as when the page's own topic changes what Weak Terms mean. */
  const recheckAll = () => {
    for (const element of doc.querySelectorAll(selector)) {
      const item = itemOf(element)!;
      if (item !== element) continue;
      checkedText.delete(item);
      check(item);
    }
  };
  /** Nothing hidden or covered may play, so a video can't spoil by sound. */
  const mayPlay = (media: HTMLMediaElement) => {
    if (page.isMasked()) return false;
    const item = itemOf(media);
    return item === null || isShown(item);
  };
  const pauseIfHidden = (event: Event) => {
    if (event.target instanceof win.HTMLMediaElement && !mayPlay(event.target)) holdMedia(event.target);
  };
  doc.addEventListener('play', pauseIfHidden, true);

  // Frames inside this page, such as live chat, count what it's about too.
  const inherited = inheritPageContext(win, recheckAll);
  const contextTopicIds = () => new Set([...page.contextTopicIds(), ...inherited.topicIds()]);

  const page = guardPageCover(adapter, win, {
    onContextChange: () => {
      recheckAll();
      sharing.notify();
    },
    onMaskChange: (masked) =>
      masked ? holdMediaIn(doc) : releaseMediaIn(doc, mayPlay),
  });
  const sharing = sharePageContext(win, () => page.contextTopicIds());
  page.update(null);

  const withhold = (item: Element) => {
    checkedText.delete(item);
    unmountCover(item);
    setState(item, null);
  };

  const show = (item: Element, state: 'clean' | 'revealed') => {
    unmountCover(item);
    setState(item, state);
    releaseMediaIn(item, mayPlay);
  };

  const cover = (item: Element, reason: HideReason, key: string) => {
    setState(item, 'covered');
    coverReasons.set(item, reason);
    holdMediaIn(item);
    mountCover(item, {
      layout: coverLayoutOf(item),
      topicName: reason.topicName,
      onReveal: () => {
        revealedKeys.set(item, key);
        show(item, 'revealed');
        recheckMirrors();
      },
    });
  };

  const check = (item: Element) => {
    for (const nested of item.querySelectorAll(selector)) {
      // It may have been an item of its own before the site wrapped it.
      unmountCover(nested);
      setState(nested, 'nested');
    }
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
      if (isMirror(item) && checkMirror(item, key)) return;
      const verdict = matcher.check({ text, contextTopicIds: contextTopicIds() });
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
      const enclosing = target && itemOf(target);
      if (enclosing) items.add(enclosing);
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        for (const element of [node as Element, ...(node as Element).querySelectorAll(selector)]) {
          const item = itemOf(element);
          if (item) items.add(item);
        }
      }
    }
    return items;
  };

  const observer = new win.MutationObserver((records) => {
    page.update(matcher);
    for (const item of itemsAffectedBy(records)) check(item);
  });
  observer.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributeFilter: adapter.observedAttributes,
  });
  for (const element of doc.querySelectorAll(selector)) awaitingMatcher.add(itemOf(element)!);

  const stopProtectingInteractions = adapter.protectInteractions?.({
    win,
    isShown: (element) => {
      const item = itemOf(element);
      return item !== null && isShown(item);
    },
  });

  let stopped = false;
  protectionState
    .getValue()
    .then((state) => {
      if (stopped) return;
      matcher = compileMatcher(state);
      page.update(matcher);
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
      doc.removeEventListener('play', pauseIfHidden, true);
      stopProtectingInteractions?.();
      page.stop();
      sharing.stop();
      inherited.stop();
      style.remove();
    },
  };
}
