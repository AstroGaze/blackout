import type { SiteGuardContext } from '../adapter';

const SUGGESTION = '.ytSuggestionComponentSuggestion';
const KEY_CODES = { ArrowDown: 40, ArrowUp: 38 } as const;

/**
 * Arrow keys in the search box put each suggestion they reach into the box,
 * covered or not. This takes over the press and passes it to YouTube one step at
 * a time until the box shows a suggestion that is shown, or what was typed. It
 * reads the box rather than YouTube's highlight, which moves a moment later.
 */
export function skipCoveredSuggestions({ win, isShown }: SiteGuardContext): () => void {
  let stepping = false;

  const onKeyDown = (event: KeyboardEvent) => {
    if (stepping || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
    const searchBox = event.target;
    if (!(searchBox instanceof win.HTMLInputElement) || searchBox.name !== 'search_query') return;
    const suggestions = Array.from(win.document.querySelectorAll(SUGGESTION));
    if (suggestions.length === 0) return;
    const suggestionShowing = (value: string) =>
      suggestions.find((suggestion) => suggestion.querySelector('[role="option"]')?.textContent?.trim() === value);

    event.preventDefault();
    event.stopPropagation();
    stepping = true;
    try {
      // Every suggestion and what was typed is at most this many steps away.
      for (let step = 0; step <= suggestions.length; step++) {
        searchBox.dispatchEvent(
          new win.KeyboardEvent('keydown', {
            key: event.key,
            code: event.key,
            keyCode: KEY_CODES[event.key],
            bubbles: true,
            cancelable: true,
          }),
        );
        const showing = suggestionShowing(searchBox.value.trim());
        if (!showing || isShown(showing)) break;
      }
    } finally {
      stepping = false;
    }
  };

  // Capturing on the window runs before YouTube's own handler on the search box.
  win.addEventListener('keydown', onKeyDown, true);
  return () => win.removeEventListener('keydown', onKeyDown, true);
}
