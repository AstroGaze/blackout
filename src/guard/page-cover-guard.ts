import { mountPageCover, unmountPageCover } from '@/cover/mount';
import type { HideReason, Matcher } from '@/matcher/matcher';
import type { SiteAdapter } from '@/sites/adapter';

/** Set on <html> while the page is masked; the hide-first stylesheet hides the body. */
export const PAGE_STATE_ATTRIBUTE = 'data-blackout-page';
export const MASKED_TITLE = 'Hidden by Blackout';
/** How long a page may stay unchecked before the cover says it couldn't be checked. */
export const UNCHECKED_AFTER_MS = 8000;

/**
 * - pending: the page is about one thing, but the site hasn't shown what yet.
 * - covered: it's about a Protected Topic.
 * - unchecked: it stayed pending too long, or its check failed.
 * - continued: the user chose to see a covered or unchecked page.
 * - clean: it passed the check.
 */
type PageState = 'none' | 'pending' | 'covered' | 'unchecked' | 'continued' | 'clean';
type PageTopic = Pick<HideReason, 'topicId' | 'topicName'>;

const MASKED_STATES: ReadonlySet<PageState> = new Set(['pending', 'covered', 'unchecked']);

export interface PageCoverGuard {
  /** Re-evaluates the page after the site changed it or the matcher changed. */
  update(matcher: Matcher | null): void;
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
  /** The topic a covered or continued page is about. */
  let topic: PageTopic | null = null;
  let subjectKey: string | null = null;
  /** The newest text the current subject has shown, and the text last checked. */
  let subjectText: string | null = null;
  let checkedText: string | null = null;
  /** The previous subject's text, which the site may still show under the new key. */
  let staleText: string | null = null;
  /** The site's own tab title for the current subject, kept while it is masked. */
  let siteTitle: string | null = null;
  let uncheckedTimer: ReturnType<typeof setTimeout> | undefined;

  const isMasked = () => MASKED_STATES.has(state);
  const contextTopicId = () =>
    topic && (state === 'covered' || state === 'continued') ? topic.topicId : null;

  const setState = (next: PageState, nextTopic: PageTopic | null) => {
    const context = contextTopicId();
    const masked = isMasked();
    state = next;
    topic = nextTopic;
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
      mountPageCover(doc, {
        topicName: state === 'covered' ? topic!.topicName : null,
        onContinue: () => setState('continued', topic),
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
    checkedText = null;
    // A title kept for the previous subject must not come back for this one.
    siteTitle = null;
    clearTimeout(uncheckedTimer);
  };

  const check = (matcher: Matcher, text: string) => {
    checkedText = text;
    clearTimeout(uncheckedTimer);
    const verdict = matcher.check({ text });
    const verdictTopic = verdict.hide ? verdict.reason : null;
    if (state === 'continued') {
      // Continued past an unchecked cover: only learn what the page is about.
      setState(verdictTopic ? 'continued' : 'clean', verdictTopic);
    } else {
      setState(verdictTopic ? 'covered' : 'clean', verdictTopic);
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
      if (subject.text !== null && subject.text !== staleText) subjectText = subject.text;

      const checkable =
        state === 'pending' ||
        state === 'unchecked' ||
        state === 'clean' ||
        (state === 'continued' && topic === null);
      if (checkable && matcher && subjectText !== null && subjectText !== checkedText) {
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
