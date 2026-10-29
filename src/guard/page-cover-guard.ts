import { mountPageCover, unmountPageCover } from '@/cover/mount';
import type { HideReason, Matcher } from '@/matcher/matcher';
import { coverReason } from '@/cover/cover';
import { requestBlock, requestUnblock } from '@/protection/blocked-sources';
import type { BlockedSource } from '@/protection/state';
import type { SiteAdapter } from '@/sites/adapter';

/** Set on <html> while the page is masked; the hide-first stylesheet hides the body. */
export const PAGE_STATE_ATTRIBUTE = 'data-blackout-page';
export const MASKED_TITLE = 'Hidden by Blackout';
/** How long a page may stay unchecked before the cover says it couldn't be checked. */
export const UNCHECKED_AFTER_MS = 8000;

/**
 * - pending: the page is about one thing, but the site hasn't shown what yet.
 * - covered: it's about a Protected Topic, or comes from a Blocked Source.
 * - unchecked: it stayed pending too long, or its check failed.
 * - continued: the user chose to see a covered or unchecked page.
 * - clean: it passed the check.
 */
type PageState = 'none' | 'pending' | 'covered' | 'unchecked' | 'continued' | 'clean';

const MASKED_STATES: ReadonlySet<PageState> = new Set(['pending', 'covered', 'unchecked']);

export interface PageCoverGuard {
  /** Re-evaluates the page after the site changed it. */
  update(matcher: Matcher | null): void;
  /** Checks the page again with a new matcher, as after the Protected Topics changed. */
  recheck(matcher: Matcher): void;
  /** Covers a page about one thing as unchecked, as when the protection state is broken. */
  cannotCheck(): void;
  /**
   * Stops masking the page or waiting for its subject while nothing is protected.
   * A page the user continued stays continued, as for its whole page view.
   */
  goIdle(): void;
  /** Whether the page is hidden or covered, so nothing on it may show or play. */
  isMasked(): boolean;
  /** Topics the page is about, so Weak Terms on it count. */
  contextTopicIds(): ReadonlySet<string>;
  stop(): void;
}

export interface PageCoverEvents {
  /** The topics the page is about changed. */
  onContextChange(): void;
  /** The page became masked, or stopped being masked. */
  onMaskChange(masked: boolean): void;
  /** The page, posted by `source`, was covered for a topic; `key` identifies what it shows. */
  onHiddenForTopic?(source: BlockedSource, reason: HideReason & { kind: 'topic' }, key: string): void;
}

/**
 * Covers a whole page that is about a Protected Topic (a video, a thread) and
 * masks its tab title, re-evaluating when the site navigates to another subject.
 */
export function guardPageCover(
  adapter: SiteAdapter,
  win: Window,
  events: PageCoverEvents,
): PageCoverGuard {
  const doc = win.document;
  let state: PageState = 'none';
  /** Why a covered or continued page is hidden: its topic, or its Blocked Source. */
  let reason: HideReason | null = null;
  let subjectKey: string | null = null;
  /** The newest text the current subject has shown. */
  let subjectText: string | null = null;
  /** The accounts the current subject comes from, when the site shows them. */
  let subjectSources: BlockedSource[] = [];
  /** The text and account last checked, as `checkKey` gives them. */
  let checkedKey: string | null = null;
  /** The previous subject's text, which the site may still show under the new key. */
  let staleText: string | null = null;
  /** The site's own tab title for the current subject, kept while it is masked. */
  let siteTitle: string | null = null;
  let uncheckedTimer: ReturnType<typeof setTimeout> | undefined;
  /** Set while checking again after the Protected Topics changed, whatever the state. */
  let rechecking = false;

  const isMasked = () => MASKED_STATES.has(state);
  const contextTopicId = () =>
    reason?.kind === 'topic' && (state === 'covered' || state === 'continued') ? reason.topicId : null;

  const setState = (next: PageState, nextReason: HideReason | null) => {
    const context = contextTopicId();
    const masked = isMasked();
    state = next;
    reason = nextReason;
    render();
    if (masked !== isMasked()) events.onMaskChange(isMasked());
    if (context !== contextTopicId()) events.onContextChange();
  };

  const render = () => {
    const html = doc.documentElement;
    if (isMasked()) html.setAttribute(PAGE_STATE_ATTRIBUTE, state);
    else html.removeAttribute(PAGE_STATE_ATTRIBUTE);
    doc.body?.toggleAttribute('inert', isMasked());

    if (state === 'covered' || state === 'unchecked') {
      const covering = state === 'covered' ? reason : null;
      const [source] = subjectSources;
      mountPageCover(doc, {
        reason: covering && coverReason(covering),
        onContinue: () => setState('continued', reason),
        onBlockSource: covering?.kind === 'topic' && source ? () => void requestBlock(source) : undefined,
        onUnblock: covering?.kind === 'blockedSource' ? () => void requestUnblock(covering.source) : undefined,
        onGoBack: () => {
          // A link opened in a new tab has nowhere to go back to.
          if (win.history.length > 1) win.history.back();
          else win.location.assign('/');
        },
      });
    } else {
      unmountPageCover(doc);
    }
    syncTitle();
  };

  const syncTitle = () => {
    if (isMasked()) {
      if (doc.title !== MASKED_TITLE) {
        siteTitle = doc.title;
        doc.title = MASKED_TITLE;
      }
    } else if (siteTitle !== null) {
      // Restore it, unless the site has set a newer title of its own meanwhile.
      if (doc.title === MASKED_TITLE) doc.title = siteTitle;
      siteTitle = null;
    }
  };

  const startUncheckedTimer = () => {
    clearTimeout(uncheckedTimer);
    uncheckedTimer = setTimeout(() => {
      if (state === 'pending') setState('unchecked', null);
    }, UNCHECKED_AFTER_MS);
  };

  const enterSubject = (key: string | null) => {
    subjectKey = key;
    staleText = subjectText;
    subjectText = null;
    subjectSources = [];
    checkedKey = null;
    // A title kept for the previous subject must not come back for this one.
    siteTitle = null;
    clearTimeout(uncheckedTimer);
  };

  /** What a check looks at: the subject's text and the accounts it comes from. */
  const checkKey = () => JSON.stringify([subjectText, subjectSources.map((source) => source.account)]);

  const check = (matcher: Matcher, text: string) => {
    checkedKey = checkKey();
    clearTimeout(uncheckedTimer);
    const verdict = matcher.check({ text, sources: subjectSources });
    const verdictReason = verdict.hide ? verdict.reason : null;
    if (verdictReason?.kind === 'topic' && subjectKey) {
      for (const source of subjectSources) events.onHiddenForTopic?.(source, verdictReason, subjectKey);
    }
    if (state === 'continued') {
      // Continuing lasts for the page view: only learn what the page is about now.
      setState('continued', verdictReason);
    } else {
      setState(verdictReason ? 'covered' : 'clean', verdictReason);
    }
  };

  const update = (matcher: Matcher | null) => {
    try {
      const subject = adapter.pageSubject(doc);
      if (subject === null) {
        if (subjectKey !== null) enterSubject(null);
        if (state !== 'none') setState('none', null);
        return;
      }
      if (subject.key !== subjectKey) {
        // A new subject, on load or after navigating: a new page view.
        enterSubject(subject.key);
        startUncheckedTimer();
        setState('pending', null);
      }
      if (subject.text !== null && subject.text !== staleText) {
        subjectText = subject.text;
        subjectSources = subject.sources ?? [];
      }

      const checkable =
        rechecking ||
        state === 'pending' ||
        state === 'unchecked' ||
        state === 'clean' ||
        (state === 'continued' && reason === null);
      if (checkable && matcher && subjectText !== null && checkKey() !== checkedKey) {
        check(matcher, subjectText);
      }
      // The site may have set its own tab title since.
      syncTitle();
    } catch (error) {
      console.error('[Blackout] Page check failed, covering the page', error);
      setState('unchecked', null);
    }
  };

  return {
    update,
    recheck(matcher) {
      checkedKey = null;
      rechecking = true;
      try {
        update(matcher);
      } finally {
        rechecking = false;
      }
    },
    cannotCheck() {
      if (subjectKey === null) return;
      clearTimeout(uncheckedTimer);
      checkedKey = null;
      setState('unchecked', null);
    },
    goIdle() {
      if (state === 'continued') return;
      setState('none', null);
      // Protecting again starts from the subject the page shows then.
      enterSubject(null);
    },
    isMasked,
    contextTopicIds: () => {
      const id = contextTopicId();
      return new Set(id === null ? [] : [id]);
    },
    stop() {
      setState('none', null);
      enterSubject(null);
    },
  };
}
