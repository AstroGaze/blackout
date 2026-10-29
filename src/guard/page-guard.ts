import { coverReason } from '@/cover/cover';
import { COVER_TAG, mountCover, unmountCover } from '@/cover/mount';
import { compileMatcher, type HideReason, type Matcher } from '@/matcher/matcher';
import { requestBlock, requestUnblock } from '@/protection/blocked-sources';
import { reportHiddenItem } from '@/protection/suggested-blocks';
import { nextPauseEnd, protectionState, type BlockedSource, type ProtectionState } from '@/protection/state';
import type { CoverLayout, SiteAdapter } from '@/sites/adapter';
import { inheritPageContext, sharePageContext } from './frame-context';
import { holdMedia, holdMediaIn, releaseMediaIn } from './media';
import { answerSourceUnderPointer } from './source-under-pointer';
import { offerSuggestedBlocks } from './suggested-block-toast';
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

/** Strong enough that nothing in a covered item or a thumbnail can be made out. */
const BLUR = 'blur(24px)';

/**
 * How long one turn of checking may run: half a frame at 60 frames per second,
 * leaving the other half as headroom on slower machines. Items a turn doesn't
 * reach stay hidden until a later one.
 */
const CHECK_TURN_MS = 8;

/** Plain selector lists rather than :is(), which some engines evaluate unreliably. */
function hideFirstCss(selectors: string[]): string {
  const each = (suffix: string) => selectors.map((selector) => selector + suffix).join(',\n');
  const covered = `[${STATE_ATTRIBUTE}="covered"]`;
  return `
${each(`:not([${STATE_ATTRIBUTE}])`)} { visibility: hidden !important; }
${each(covered)} {
  position: relative !important;
  overflow: hidden !important;
  /* The cover stays above the item's content, but not above the site's own header. */
  isolation: isolate !important;
}
${each(`${covered} > :not(${COVER_TAG})`)} {
  filter: ${BLUR} !important;
  pointer-events: none !important;
  user-select: none !important;
}
html[${PAGE_STATE_ATTRIBUTE}] body { visibility: hidden !important; }`;
}

/**
 * Blurs every thumbnail, for the blur-all-thumbnails switch, clipped to its own
 * box so the blur doesn't spread over what's around it.
 */
function blurThumbnailsCss(thumbnails: string[]): string {
  if (thumbnails.length === 0) return '';
  return `${thumbnails.join(',\n')} {
  filter: ${BLUR} !important;
  clip-path: inset(0 round 12px) !important;
}`;
}

/** Keeps focus and screen readers out of a covered item's own content. */
function setContentInert(item: Element, inert: boolean) {
  for (const child of item.children) {
    if (child.localName === COVER_TAG) continue;
    child.toggleAttribute('inert', inert);
  }
}

function isHovered(element: Element): boolean {
  try {
    return element.matches(':hover');
  } catch {
    return false;
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
  /**
   * Shadow roots that hold items. Document styles and observers don't reach into
   * them, so each gets its own copy of the hide-first stylesheet and is observed too.
   */
  const hostSelector = adapter.shadowHosts?.join(', ') ?? '';
  const shadowRoots: ShadowRoot[] = [];
  const shadowStyles: HTMLStyleElement[] = [];
  /**
   * Hosts seen before their shadow root was attached, by when to give up on them.
   * They are looked at again on later changes and every frame: attaching a shadow
   * root and filling it changes nothing the observer sees.
   */
  const hostsWithoutShadow = new Map<Element, number>();
  const LATE_SHADOW_ROOT_MS = 10_000;
  let lateShadowFrame: number | undefined;
  // Thumbnails stay blurred until the switch is known to be off, so none shows before the setting is read.
  const thumbnailBlurCss = blurThumbnailsCss(adapter.thumbnails ?? []);
  const thumbnailStyle = doc.createElement('style');
  thumbnailStyle.textContent = thumbnailBlurCss;
  doc.documentElement.append(thumbnailStyle);

  let matcher: Matcher | null = null;
  /**
   * Set while the matcher can hide nothing (no topic is active), when nothing is
   * hidden or checked.
   */
  let idle = false;
  const awaitingMatcher = new Set<Element>();
  /** The text each item had when it was last checked, to skip unchanged items. */
  const checkedText = new WeakMap<Element, string>();
  /** Items revealed during this page view, with the content key they had then. */
  const revealedKeys = new WeakMap<Element, string>();
  /** Why each covered item is covered, so a mirror of it can say the same. */
  const coverReasons = new WeakMap<Element, HideReason>();
  const contentKey = (item: Element, text: string) => adapter.itemKey(item) ?? text;
  /**
   * The accounts an item comes from, or none when the site doesn't show them or
   * they can't be read. For offering to block them; a check reads them itself and fails closed.
   */
  const sourcesOf = (item: Element): BlockedSource[] => {
    try {
      return adapter.itemSources(item);
    } catch {
      return [];
    }
  };

  /**
   * Keeps a mirror (a hover preview) as hidden as the item it shows, and lets it
   * show what the user revealed. Returns false when its own check should decide.
   */
  const checkMirror = (mirror: Element, key: string): boolean => {
    const copies = Array.from(doc.querySelectorAll(selector)).filter(
      (item) => item !== mirror && !isMirror(item) && itemOf(item) === item && adapter.itemKey(item) === key,
    );
    // The same video can appear twice, covered for different topics; a preview
    // shows the one under the pointer.
    const hovered = copies.filter((item) => isHovered(item));
    const sources = hovered.length > 0 ? hovered : copies;
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

  /** Acts on every item on the page, shadow roots included, the outermost one where items nest. */
  const forEachItem = (act: (item: Element) => void) => {
    for (const root of [doc, ...shadowRoots]) {
      for (const element of root.querySelectorAll(selector)) {
        if (itemOf(element) === element) act(element);
      }
    }
  };

  /** Items waiting for a check, in the order they arrived, which is mostly page order. */
  const queued = new Set<Element>();
  /**
   * Time spent checking in the current task. All its turns share one budget:
   * covering an item changes the page, which sets off another batch before the
   * browser can paint.
   */
  let spentThisTask = 0;
  /** The next task's turn, which starts its budget afresh. */
  let nextTurn: number | undefined;
  const startNextTask = () => {
    nextTurn = undefined;
    spentThisTask = 0;
    if (queued.size > 0) checkQueued();
  };
  /** Checks queued items while the task's budget lasts, and carries on in the next task. */
  const checkQueued = () => {
    const start = win.performance.now();
    const deadline = start + CHECK_TURN_MS - spentThisTask;
    for (const item of queued) {
      if (win.performance.now() >= deadline) break;
      queued.delete(item);
      if (!item.isConnected) continue;
      check(item);
    }
    spentThisTask += win.performance.now() - start;
    nextTurn ??= win.setTimeout(startNextTask, 0);
    // A shown item waiting here may have changed, so it mustn't show until checked.
    for (const item of queued) if (isShown(item)) withhold(item);
  };
  const queueChecks = (items: Iterable<Element>) => {
    for (const item of items) queued.add(item);
    checkQueued();
  };

  /** Checks every item again, as when the page's own topic changes what Weak Terms mean. */
  const recheckAll = () => {
    if (idle) return;
    const items: Element[] = [];
    forEachItem((item) => {
      checkedText.delete(item);
      items.push(item);
    });
    queueChecks(items);
  };
  /** Nothing hidden or covered may play, so a video can't spoil by sound. */
  const mayPlay = (media: HTMLMediaElement) => {
    if (idle) return true;
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
    onHiddenForTopic: (source, reason, key) => countHidden(source, reason, key),
    onMaskChange: (masked) =>
      masked ? holdMediaIn(doc) : releaseMediaIn(doc, mayPlay),
  });
  const sharing = sharePageContext(win, () => page.contextTopicIds());
  page.update(null);

  /** Items with a cover mounted, so stopping can take every cover down. */
  const coveredItems = new Set<Element>();
  const removeCover = (item: Element) => {
    unmountCover(item);
    coveredItems.delete(item);
  };

  const withhold = (item: Element) => {
    checkedText.delete(item);
    removeCover(item);
    setState(item, null);
    holdMediaIn(item);
  };

  const show = (item: Element, state: 'clean' | 'revealed') => {
    removeCover(item);
    setState(item, state);
    releaseMediaIn(item, mayPlay);
  };

  const cover = (item: Element, reason: HideReason, key: string) => {
    setState(item, 'covered');
    coverReasons.set(item, reason);
    holdMediaIn(item);
    coveredItems.add(item);
    const sources = reason.kind === 'topic' ? sourcesOf(item) : [];
    const [source] = sources;
    mountCover(item, {
      layout: coverLayoutOf(item),
      reason: coverReason(reason),
      // A preview lies over its tile, and nothing of the tile may show through it.
      opaque: isMirror(item),
      onReveal: () => {
        revealedKeys.set(item, key);
        show(item, 'revealed');
        recheckMirrors();
      },
      onBlockSource: source ? () => void requestBlock(source) : undefined,
      onUnblock: reason.kind === 'blockedSource' ? () => void requestUnblock(reason.source) : undefined,
    });
    // Only items with an identity count, so one can't count twice by changing its text.
    const itemKey = adapter.itemKey(item);
    if (reason.kind === 'topic' && itemKey && !isMirror(item)) {
      for (const each of sources) countHidden(each, reason, itemKey);
    }
  };

  /** Hidden Items already reported for Suggested Blocks during this page view. */
  const reported = new Set<string>();
  const countHidden = (source: BlockedSource, reason: HideReason & { kind: 'topic' }, key: string) => {
    const id = JSON.stringify([source.site, source.account, reason.topicId, key]);
    if (reported.has(id)) return;
    reported.add(id);
    reportHiddenItem({ source, topicId: reason.topicId, topicName: reason.topicName, itemKey: key }).catch(() => {
      // Without the background, nothing is counted; the item stays hidden all the same.
    });
  };

  const check = (item: Element) => {
    for (const nested of item.querySelectorAll(selector)) {
      // It may have been an item of its own before the site wrapped it.
      removeCover(nested);
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
      const place = adapter.pagePlace?.(doc);
      const verdict = matcher.check({
        text,
        contextTopicIds: contextTopicIds(),
        sources: adapter.itemSources(item),
        places: place ? [place] : [],
      });
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
        // Everything inside an item belongs to it, so there's nothing more to look for.
        const item = itemOf(node as Element);
        if (item) {
          items.add(item);
          continue;
        }
        // In document order an item comes before what it contains, so each element
        // is either inside the last outermost item or starts a new one.
        let outermost: Element | null = null;
        for (const element of (node as Element).querySelectorAll(selector)) {
          if (outermost?.contains(element)) continue;
          outermost = element;
          items.add(element);
        }
      }
    }
    return items;
  };

  const observer = new win.MutationObserver((records) => {
    page.update(matcher);
    if (hostSelector) watchNewShadowRoots(records);
    queueChecks(itemsAffectedBy(records));
  });
  const observeOptions: MutationObserverInit = {
    childList: true,
    subtree: true,
    characterData: true,
    attributeFilter: adapter.observedAttributes,
  };
  const observe = () => {
    observer.observe(doc.documentElement, observeOptions);
    for (const root of shadowRoots) observer.observe(root, observeOptions);
  };

  const lookForLateShadowRoots = () => {
    lateShadowFrame = undefined;
    const now = win.performance.now();
    for (const [host, giveUpAt] of hostsWithoutShadow) {
      if (!host.isConnected || now > giveUpAt) hostsWithoutShadow.delete(host);
      else watchShadowOf(host);
    }
  };
  const watchShadowOf = (host: Element) => {
    const root = host.shadowRoot;
    if (!root) {
      if (!hostsWithoutShadow.has(host)) hostsWithoutShadow.set(host, win.performance.now() + LATE_SHADOW_ROOT_MS);
      lateShadowFrame ??= win.requestAnimationFrame(lookForLateShadowRoots);
      return;
    }
    hostsWithoutShadow.delete(host);
    if (shadowRoots.includes(root)) return;
    shadowRoots.push(root);
    const copy = doc.createElement('style');
    copy.textContent = style.textContent;
    root.append(copy);
    shadowStyles.push(copy);
    if (!idle) observer.observe(root, observeOptions);
    const items: Element[] = [];
    for (const element of root.querySelectorAll(selector)) if (itemOf(element) === element) items.push(element);
    queueChecks(items);
  };
  const watchNewShadowRoots = (records: MutationRecord[]) => {
    for (const host of hostsWithoutShadow.keys()) watchShadowOf(host);
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const element = node as Element;
        if (element.matches(hostSelector)) watchShadowOf(element);
        for (const host of element.querySelectorAll(hostSelector)) watchShadowOf(host);
      }
    }
  };
  /** Sets the hide-first rules everywhere they apply: the document and each shadow root. */
  const setHideFirstCss = (css: string) => {
    for (const each of [style, ...shadowStyles]) each.textContent = css;
  };

  observe();
  if (hostSelector) for (const host of doc.querySelectorAll(hostSelector)) watchShadowOf(host);
  for (const element of doc.querySelectorAll(selector)) awaitingMatcher.add(itemOf(element)!);

  // The right-click menu's "Block this channel" (or subreddit, or user) blocks a source
  // of the item under the pointer, or the one a right-clicked link points to, such as a
  // video's channel name.
  const stopAnsweringSource = answerSourceUnderPointer(win, (target) => {
    const item = itemOf(target);
    if (item) return sourcesOf(item);
    const link = target.closest('a[href]');
    return link ? sourcesOf(link) : [];
  });

  const stopProtectingInteractions = adapter.protectInteractions?.({
    win,
    isShown: (element) => {
      if (idle) return true;
      const item = itemOf(element);
      return item !== null && isShown(item);
    },
  });

  /** Hides every item until a check can run again. */
  const withholdAll = () => forEachItem(withhold);

  /**
   * Stops or resumes protecting the page. While idle the guard watches nothing and
   * hides nothing: every item loses its state and cover, and the hide-first
   * stylesheet is emptied.
   */
  const setIdle = (next: boolean) => {
    if (next === idle) return;
    idle = next;
    if (idle) {
      observer.disconnect();
      win.clearTimeout(nextTurn);
      nextTurn = undefined;
      queued.clear();
      withholdAll();
      setHideFirstCss('');
      page.goIdle();
      releaseMediaIn(doc, mayPlay);
    } else {
      setHideFirstCss(hideFirstCss(selectors));
      // Items wait hidden for their check again, so none of them may play meanwhile.
      forEachItem(holdMediaIn);
      observe();
      // Shadow hosts added while idle weren't seen.
      if (hostSelector) for (const host of doc.querySelectorAll(hostSelector)) watchShadowOf(host);
    }
  };

  let stopped = false;
  let pauseEndTimer: ReturnType<typeof setTimeout> | undefined;
  let pauseEnd: number | null = null;
  let latestState: ProtectionState | null = null;
  const suggestions = offerSuggestedBlocks(doc, adapter.site, () => latestState);
  /** Compiles the protection state and checks the page and every item against it. */
  const applyState = (state: ProtectionState) => {
    if (stopped) return;
    clearTimeout(pauseEndTimer);
    latestState = state;
    thumbnailStyle.textContent = state.blurAllThumbnails ? thumbnailBlurCss : '';
    const now = Date.now();
    try {
      matcher = compileMatcher(state, now);
    } catch (error) {
      // Without a matcher nothing passes a check, so everything stays hidden.
      console.error('[Blackout] Could not use the protection state', error);
      matcher = null;
      setIdle(false);
      withholdAll();
      page.cannotCheck();
      return;
    }
    page.recheck(matcher);
    awaitingMatcher.clear();
    setIdle(!matcher.protects);
    recheckAll();
    suggestions.refresh();
    // A Pause switches its topic back on by itself when it ends.
    pauseEnd = nextPauseEnd(state, now);
    if (pauseEnd !== null) pauseEndTimer = setTimeout(() => applyState(state), pauseEnd - now);
  };
  // Timers can fire late after the computer sleeps; check again when the tab shows.
  const catchUpOnPauses = () => {
    if (latestState && pauseEnd !== null && pauseEnd <= Date.now()) applyState(latestState);
  };
  doc.addEventListener('visibilitychange', catchUpOnPauses);
  win.addEventListener('focus', catchUpOnPauses);

  protectionState
    .getValue()
    .then(applyState)
    .catch((error) => {
      // Without a matcher nothing passes a check, so everything stays hidden.
      console.error('[Blackout] Could not load protection state', error);
    });
  // Open pages react straight away when the Protected Topics change.
  const stopWatching = protectionState.watch((state) => {
    if (state) applyState(state);
  });

  return {
    stop() {
      stopped = true;
      clearTimeout(pauseEndTimer);
      win.clearTimeout(nextTurn);
      doc.removeEventListener('visibilitychange', catchUpOnPauses);
      win.removeEventListener('focus', catchUpOnPauses);
      stopWatching();
      observer.disconnect();
      doc.removeEventListener('play', pauseIfHidden, true);
      stopProtectingInteractions?.();
      stopAnsweringSource();
      suggestions.stop();
      for (const item of coveredItems) removeCover(item);
      page.stop();
      sharing.stop();
      inherited.stop();
      style.remove();
      for (const copy of shadowStyles) copy.remove();
      if (lateShadowFrame !== undefined) win.cancelAnimationFrame(lateShadowFrame);
      thumbnailStyle.remove();
    },
  };
}
