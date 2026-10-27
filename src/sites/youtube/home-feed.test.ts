import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { coveredTitles, renderPage, settle, viewItem, viewItems } from '@/test/page';
import { youtube } from './adapter';
import homeFeed from './fixtures/home-feed.html?raw';
import { homeFeedTile } from './fixtures/tile';

const TILE = 'ytd-rich-item-renderer';

let guard: PageGuard | undefined;

beforeEach(() => {
  fakeBrowser.reset();
  document.body.replaceChildren();
});

afterEach(() => {
  guard?.stop();
  guard = undefined;
});

describe('YouTube home feed with the ready-made GTA 6 topic', () => {
  it('covers exactly the tiles that name GTA 6, labelled with the topic', async () => {
    guard = startPageGuard(youtube);
    renderPage(homeFeed);
    await settle();

    expect(coveredTitles(TILE)).toEqual([
      'Grand Theft Auto VI Trailer 2',
      'Millie Bobby Brown Is Excited for GTA 6 😭…',
      '10 COSAS De GTA 5 Que NO PODRÁS Hacer En GTA 6',
      'Tráiler de lanzamiento de Grand Theft Auto VI',
      'ILLOJUAN REACTS to ALL the NEW GTA 6 RADIO STATIONS',
      'GTA 6 (Grand Theft Auto 6) - Official Extended Gameplay',
      'Fuerza Regida - Suzuki (From Grand Theft Auto VI: The Album)',
      'GTA VI | Lucia Club Dancing Gameplay & Full Soundtrack',
      'NEW GTA 6 Screenshots & Exclusive Information Coming Soon - Map Details, Gameplay Info & MORE!',
      "15 THINGS From GTA 5 You WON'T Be Able To Do In GTA 6",
    ]);
    const views = viewItems(TILE);
    expect(views.filter((view) => view.state === 'covered').map((view) => view.reason)).toEqual(
      Array(10).fill('GTA 6'),
    );
    expect(views.filter((view) => view.state === 'shown')).toHaveLength(75);
  });

  it('withholds every tile from first paint until it has been checked', () => {
    guard = startPageGuard(youtube);
    renderPage(homeFeed);

    const views = viewItems(TILE);
    expect(views).toHaveLength(85);
    expect(views.every((view) => view.state === 'withheld')).toBe(true);
  });

  it('keeps every tile hidden when the protection state is broken', async () => {
    await fakeBrowser.storage.local.set({
      protectionState: { topics: [{ id: 'gta-6', name: 'GTA 6', terms: [{ text: null }] }] },
    });

    guard = startPageGuard(youtube);
    renderPage(homeFeed);
    await settle();

    expect(viewItems(TILE).every((view) => view.state === 'withheld')).toBe(true);
  });

  it('checks tiles that arrive later as the feed scrolls', async () => {
    guard = startPageGuard(youtube);
    renderPage(homeFeed);
    await settle();

    const grid = document.querySelector('ytd-rich-grid-renderer #contents')!;
    grid.append(homeFeedTile('The whole Leonida map, mapped'), homeFeedTile('Cats knocking things off tables'));
    await settle();

    expect(viewItems(TILE).slice(-2)).toEqual([
      { title: 'The whole Leonida map, mapped', state: 'covered', reason: 'GTA 6' },
      { title: 'Cats knocking things off tables', state: 'shown' },
    ]);
  });

  it('re-checks a tile when YouTube reuses it for another video', async () => {
    guard = startPageGuard(youtube);
    renderPage(homeFeed);
    await settle();
    const catTile = findTile('Ranking Funniest Cat Memes Ever');
    const trailerTile = findTile('Grand Theft Auto VI Trailer 2');

    setTitle(catTile, 'GTA 6 ending explained');
    setTitle(trailerTile, 'Best pasta recipes');
    await settle();

    expect([viewItem(catTile), viewItem(trailerTile)]).toEqual([
      { title: 'GTA 6 ending explained', state: 'covered', reason: 'GTA 6' },
      { title: 'Best pasta recipes', state: 'shown' },
    ]);
  });
});


function findTile(titleStart: string): Element {
  const found = Array.from(document.querySelectorAll(TILE)).find((item) =>
    item.querySelector('h3')?.textContent?.trim().startsWith(titleStart),
  );
  if (!found) throw new Error(`No tile titled "${titleStart}…"`);
  return found;
}

/** Changes a tile's title the way YouTube does when it reuses the element. */
function setTitle(item: Element, title: string): void {
  item.querySelector('h3 a span, h3 span')!.textContent = title;
}
