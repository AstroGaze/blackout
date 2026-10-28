import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { clickCoverButton, renderPage, settle } from '@/test/page';
import { youtube } from './adapter';
import search from './fixtures/search.html?raw';
import { coveredTitles, viewItem, viewItems } from './fixtures/view';

let guard: PageGuard | undefined;

beforeEach(async () => {
  fakeBrowser.reset();
  guard = startPageGuard(youtube);
  // Results for "gta", with "gta " typed into the search box to open suggestions.
  renderPage(search);
  await settle();
});

afterEach(() => guard?.stop());

const SHORT = 'ytm-shorts-lockup-view-model';

const shortsBy = (state: 'covered' | 'shown') =>
  Array.from(document.querySelectorAll(SHORT)).filter((short) => viewItem(short).state === state);

/**
 * Fills YouTube's shared preview player the way hovering a Short does: with that
 * Short's link, a title and a playing video, laid over the Short.
 */
async function hoverPreview(short: Element, title: string): Promise<Element> {
  const href = short.querySelector('a[href*="/shorts/"]')!.getAttribute('href')!;
  const preview = document.querySelector('ytd-video-preview')!;
  const link = document.createElement('a');
  link.className = 'ytdVideoPreviewMediaContainerLink';
  link.setAttribute('href', href);
  link.append(document.createElement('video'));
  const heading = document.createElement('h3');
  heading.textContent = title;
  preview.replaceChildren(link, heading);
  await settle();
  return preview;
}

/**
 * The snapshot has no YouTube scripts, so this does what YouTube does with arrow
 * keys in the search box, as seen in Brave: it moves to the next or previous
 * suggestion, wrapping around to what was typed, and puts it in the box at
 * once. It only moves the highlight onto that suggestion a moment later.
 */
function withYouTubeArrowKeys(): HTMLInputElement {
  const searchBox = document.querySelector<HTMLInputElement>('input[name="search_query"]')!;
  const typed = 'gta ';
  searchBox.value = typed;
  let current = -1;
  searchBox.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const rows = Array.from(document.querySelectorAll('.ytSuggestionComponentSuggestion'));
    const positions = rows.length + 1; // every suggestion, plus what was typed
    current = ((current + 1 + (event.key === 'ArrowDown' ? 1 : -1) + positions) % positions) - 1;
    searchBox.value = current === -1 ? typed : rows[current]!.querySelector('[role="option"]')!.textContent!.trim();
    const highlighted = current;
    queueMicrotask(() =>
      rows.forEach((row, index) => row.classList.toggle('ytSuggestionComponentHighlighted', index === highlighted)),
    );
  });
  return searchBox;
}

/** Presses `key` in the search box `times` times, returning what it shows after each. */
async function pressRepeatedly(searchBox: HTMLInputElement, key: string, times: number): Promise<string[]> {
  const seen: string[] = [];
  for (let press = 0; press < times; press++) {
    searchBox.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    await settle();
    seen.push(searchBox.value);
  }
  return seen;
}

/** The button inside an item's cover whose text is `name`. */
function coverButton(item: Element, name: string): HTMLButtonElement {
  const button = Array.from(
    item.querySelector('blackout-cover')?.shadowRoot?.querySelectorAll('button') ?? [],
  ).find((candidate) => candidate.textContent?.trim() === name);
  if (!button) throw new Error(`No "${name}" button on the cover`);
  return button;
}

describe('YouTube search for "gta" with the ready-made GTA 6 topic', () => {
  it('covers the results about GTA 6 and shows the rest', () => {
    expect(coveredTitles('ytd-video-renderer')).toEqual([
      'Grand Theft Auto VI Launch Trailer',
      'Grand Theft Auto VI: An Extended Look',
      'GTA 6 Just Got a TON of NEW Information...',
      'Grand Theft Auto VI Trailer 2',
      'GTA Recap - The Complete Timeline (Watch Before GTA 6!)',
      'Tráiler de lanzamiento de Grand Theft Auto VI',
      'GTA 6 File Size is Absolutely Insane',
      'Grand Theft Auto VI Launch Trailer',
      'Grand Theft Auto VI - Launch Trailer | PS5 Games',
      'Grand Theft Auto VI - Tráiler de lanzamiento',
    ]);
    const shown = viewItems('ytd-video-renderer').filter((view) => view.state === 'shown');
    expect(shown.map((view) => view.title)).toContain('Homeless Man Becomes PRESIDENT in GTA 5');
    expect(shown).toHaveLength(10);
  });

  it.each([
    ['description', '.metadata-snippet-text', 'We drove the whole Leonida coastline'],
    ['channel name', 'ytd-channel-name a', 'GTA 6 Daily'],
  ])('counts a result’s %s as part of its text', async (_, part, text) => {
    const result = Array.from(document.querySelectorAll('ytd-video-renderer')).find((item) =>
      item.textContent?.includes('Homeless Man Becomes PRESIDENT'),
    )!;
    for (const element of result.querySelectorAll(part)) element.textContent = text;
    await settle();

    expect(viewItem(result)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
  });

  it('covers the search suggestions about GTA 6 and shows the rest', () => {
    const views = viewItems('.ytSuggestionComponentSuggestion');
    expect(views.map(({ title, state }) => `${state}: ${title}`)).toEqual([
      'covered: gta 6',
      'covered: gta 6 trailer',
      'shown: gta 5',
      'covered: gta 6 gameplay',
      'shown: gta 5 trailer',
      'shown: gta 4',
      'shown: gta online',
      'covered: gta 6 extended look',
      'covered: gta 6 trailer 2',
      'shown: gta v',
      'shown: gta 5 online',
      'covered: gta vi song',
      'shown: gta san andreas',
      'covered: gta 6 reaction',
    ]);
  });

  describe("YouTube's hover preview over a Short", () => {
    it('covers the preview of a covered Short, and keeps its video from playing', async () => {
      const short = shortsBy('covered')[0]!;

      const preview = await hoverPreview(short, 'Watch the new clip');
      const video = preview.querySelector('video')!;
      await video.play();

      expect(viewItem(preview)).toMatchObject({ state: 'covered', reason: 'GTA 6' });
      expect(video.paused).toBe(true);
    });

    it('shows the preview of a Short that is shown', async () => {
      const short = shortsBy('shown')[0]!;

      const preview = await hoverPreview(short, viewItem(short).title);

      expect(viewItem(preview)).toMatchObject({ state: 'shown' });
    });

    it('shows the preview of a Short the user revealed', async () => {
      const short = shortsBy('covered')[0]!;
      clickCoverButton(short, 'Reveal');
      await settle();
      clickCoverButton(short, 'Show');
      await settle();

      const preview = await hoverPreview(short, 'Watch the new clip');

      expect(viewItem(preview)).toMatchObject({ state: 'shown' });
    });
  });

  it("keeps presses and clicks on a covered suggestion's cover from reaching YouTube", async () => {
    const suggestion = Array.from(document.querySelectorAll('.ytSuggestionComponentSuggestion')).find(
      (item) => viewItem(item).state === 'covered',
    )!;
    const reachedYouTube: string[] = [];
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      suggestion.addEventListener(type, () => reachedYouTube.push(type));
    }

    const reveal = coverButton(suggestion, 'Reveal');
    const presses = ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].map(
      (type) => new MouseEvent(type, { bubbles: true, composed: true, cancelable: true }),
    );
    for (const press of presses) reveal.dispatchEvent(press);
    reveal.click();
    await settle();

    expect(reachedYouTube).toEqual([]);
    // Pressing doesn't move focus off the search box, which would close the suggestions.
    expect(presses.find((press) => press.type === 'mousedown')!.defaultPrevented).toBe(true);
    expect(() => coverButton(suggestion, 'Show')).not.toThrow();
  });

  describe('moving through the suggestions with the arrow keys', () => {
    const SHOWN = ['gta 5', 'gta 5 trailer', 'gta 4', 'gta online', 'gta v', 'gta 5 online', 'gta san andreas'];

    it('skips covered suggestions going down, back to what was typed', async () => {
      const searchBox = withYouTubeArrowKeys();

      const seen = await pressRepeatedly(searchBox, 'ArrowDown', SHOWN.length + 1);

      expect(seen).toEqual([...SHOWN, 'gta ']);
    });

    it('skips covered suggestions going up', async () => {
      const searchBox = withYouTubeArrowKeys();

      const seen = await pressRepeatedly(searchBox, 'ArrowUp', SHOWN.length + 1);

      expect(seen).toEqual([...SHOWN].reverse().concat('gta '));
    });
  });

  it('covers the Shorts in the results shelf that are about GTA 6', () => {
    const views = viewItems('ytm-shorts-lockup-view-model');
    const covered = views.flatMap((view, index) => (view.state === 'covered' ? [index] : []));
    // By title: a #gta6 tag, "GTA 6 Dancing…", another #gta6 tag, "GTA 6's file size…", "POV: GTA 6…".
    expect(covered).toEqual([0, 3, 7, 8, 11]);
    expect(views.filter((view) => view.state === 'shown')).toHaveLength(10);
  });
});
