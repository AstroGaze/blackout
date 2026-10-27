/**
 * What a page is about, shared with the frames inside it (such as live chat on
 * a watch page). It's kept on the window in the extension's isolated world, which
 * Blackout in a same-origin child frame can read but the site's own scripts can't.
 */
const SHARED_KEY = '__blackoutPageContext';

interface SharedPageContext {
  topicIds(): ReadonlySet<string>;
  /** Calls `listener` when the topics change; returns a function that stops it. */
  subscribe(listener: () => void): () => void;
}

type WindowWithContext = Window & { [SHARED_KEY]?: SharedPageContext };

/** Shares this frame's page topics with its child frames. */
export function sharePageContext(win: Window, topicIds: () => ReadonlySet<string>) {
  const listeners = new Set<() => void>();
  const shared: SharedPageContext = {
    topicIds,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  (win as WindowWithContext)[SHARED_KEY] = shared;
  return {
    /** Tells child frames the topics changed. */
    notify() {
      for (const listener of listeners) {
        try {
          listener();
        } catch {
          // The child frame has gone away.
          listeners.delete(listener);
        }
      }
    },
    stop() {
      listeners.clear();
      if ((win as WindowWithContext)[SHARED_KEY] === shared) delete (win as WindowWithContext)[SHARED_KEY];
    },
  };
}

/** The page topics of the frames this one sits inside, kept up to date. */
export function inheritPageContext(win: Window, onChange: () => void) {
  const subscribed = new Map<SharedPageContext, () => void>();

  const ancestors = (): SharedPageContext[] => {
    const found: SharedPageContext[] = [];
    for (let frame = win; frame.parent !== frame; ) {
      frame = frame.parent;
      try {
        const shared = (frame as WindowWithContext)[SHARED_KEY];
        if (shared) found.push(shared);
      } catch {
        // A cross-origin ancestor: nothing to inherit from it.
      }
    }
    return found;
  };

  const subscribe = (shared: SharedPageContext[]) => {
    for (const ancestor of shared) {
      if (!subscribed.has(ancestor)) subscribed.set(ancestor, ancestor.subscribe(onChange));
    }
  };
  subscribe(ancestors());

  const stop = () => {
    for (const unsubscribe of subscribed.values()) unsubscribe();
    subscribed.clear();
  };
  win.addEventListener('pagehide', stop);

  return {
    topicIds(): ReadonlySet<string> {
      const shared = ancestors();
      // An ancestor may have started sharing after this frame did.
      subscribe(shared);
      return new Set(shared.flatMap((ancestor) => [...ancestor.topicIds()]));
    },
    stop,
  };
}
