import { performance as nodePerformance, PerformanceObserver } from 'node:perf_hooks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { protectionState } from '@/protection/state';
import { renderPage, settle } from '@/test/page';
import { gta6, stateWithTopics } from '@/test/state';
import { youtube } from './adapter';
import homeFeed from './fixtures/home-feed.html?raw';
import { viewItem } from './fixtures/view';

const TILE = 'ytd-rich-item-renderer';
/** The budget a batch must keep to, a frame at 60 frames per second. */
const FRAME_MS = 16;

let guard: PageGuard | undefined;
const restores: (() => void)[] = [];

beforeEach(() => {
  fakeBrowser.reset();
  document.body.replaceChildren();
});

afterEach(() => {
  guard?.stop();
  guard = undefined;
  for (const restore of restores.splice(0)) restore();
});

interface Span {
  start: number;
  end: number;
}

/**
 * Times the guard's work in each task, the unit the browser can't paint during:
 * a turn it scheduled, or a batch of changes it observed, together with every
 * further batch the same task's changes set off. Garbage collection pauses of the
 * test runtime, which keeps the whole simulated DOM on its heap, are left out.
 */
function timeGuardTasks(): { reset(): void; tasks(): number[] } {
  const tasks: Span[] = [];
  const pauses: Span[] = [];
  const gcObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) pauses.push({ start: entry.startTime, end: entry.startTime + entry.duration });
  });
  gcObserver.observe({ entryTypes: ['gc'] });

  /** The task being timed, kept open while its microtasks set off more guard work. */
  let open: (Span & { work: number }) | null = null;
  const closeWhenQuiet = (seen: number) => {
    queueMicrotask(() => {
      if (!open) return;
      if (open.work !== seen) return closeWhenQuiet(open.work);
      tasks.push({ start: open.start, end: open.end });
      open = null;
    });
  };
  const timed = <A extends unknown[]>(callback: (...args: A) => void) => (...args: A) => {
    const start = nodePerformance.now();
    try {
      callback(...args);
    } finally {
      if (open) {
        open.end = nodePerformance.now();
        open.work++;
      } else {
        open = { start, end: nodePerformance.now(), work: 0 };
        closeWhenQuiet(0);
      }
    }
  };
  const OriginalObserver = window.MutationObserver;
  window.MutationObserver = class extends OriginalObserver {
    constructor(callback: MutationCallback) {
      super(timed(callback));
    }
  };
  const originalSetTimeout = window.setTimeout;
  window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) =>
    originalSetTimeout(typeof handler === 'function' ? timed(handler as () => void) : handler, delay, ...args)) as typeof window.setTimeout;
  restores.push(() => {
    window.MutationObserver = OriginalObserver;
    window.setTimeout = originalSetTimeout;
    gcObserver.disconnect();
  });

  const overlap = (span: Span, pause: Span) => Math.max(0, Math.min(span.end, pause.end) - Math.max(span.start, pause.start));
  return {
    reset: () => {
      tasks.length = 0;
    },
    tasks: () => tasks.map((task) => task.end - task.start - pauses.reduce((total, pause) => total + overlap(task, pause), 0)),
  };
}

/** Fresh copies of the saved feed's tiles, as YouTube adds them while scrolling. */
function savedFeedTiles(): Element[] {
  const template = document.createElement('template');
  template.innerHTML = homeFeed.slice(homeFeed.search(/<body[\s>]/i), homeFeed.search(/<\/body>/i));
  return Array.from(template.content.querySelectorAll(TILE)).filter((tile) => !tile.parentElement?.closest(TILE));
}

const grid = () => document.querySelector('ytd-rich-grid-renderer #contents')!;

describe('Performance budget on a large saved YouTube feed', () => {
  it(`checks each batch of new items within ${FRAME_MS} ms, with headroom for slower machines`, async () => {
    const timing = timeGuardTasks();
    await protectionState.setValue(stateWithTopics(gta6()));
    guard = startPageGuard(youtube);
    renderPage(homeFeed);
    await settle();
    const coveredPerPage = Array.from(grid().children).filter((tile) => viewItem(tile).state === 'covered').length;
    const feed = savedFeedTiles();
    // Infinite scroll adding five pages of the saved feed at once.
    const added = [0, 1, 2, 3, 4].flatMap(() => feed.map((tile) => tile.cloneNode(true) as Element));
    timing.reset();
    grid().append(...added);
    await settle();
    // Garbage collection is reported a moment after it happens.
    await new Promise((resolve) => setTimeout(resolve, 20));

    // The guard keeps each task's checking to half a frame. The other half is headroom
    // for a slower machine; this simulated DOM is already several times slower than Brave.
    const tasks = timing.tasks();
    expect(tasks.length).toBeGreaterThan(3);
    expect(tasks.filter((task) => task >= FRAME_MS).map(Math.round)).toEqual([]);
    expect(added.length).toBeGreaterThan(300);
    const views = added.map((tile) => viewItem(tile).state);
    expect(views.filter((state) => state === 'withheld')).toEqual([]);
    // Checked in turns, the copies are covered just as the saved page's own tiles are.
    expect(coveredPerPage).toBeGreaterThan(5);
    expect(views.filter((state) => state === 'covered').length).toBe(5 * coveredPerPage);
  });
});
