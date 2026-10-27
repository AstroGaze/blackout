import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { renderPage, settle } from '@/test/page';
import { youtube } from './adapter';
import notifications from './fixtures/notifications.html?raw';
import { viewItems } from './fixtures/view';

let guard: PageGuard | undefined;

beforeEach(async () => {
  fakeBrowser.reset();
  guard = startPageGuard(youtube);
  // A hand-written notifications menu: see the note in the fixture.
  renderPage(notifications);
  await settle();
});

afterEach(() => guard?.stop());

describe('YouTube notifications with the ready-made GTA 6 topic', () => {
  it('covers the notifications about GTA 6 and shows the rest', () => {
    expect(
      viewItems('ytd-notification-renderer').map(({ title, state }) => `${state}: ${title}`),
    ).toEqual([
      'covered: Rockstar Games uploaded: Grand Theft Auto VI Trailer 3',
      'shown: MrBeast uploaded: I Survived 100 Days In A Desert',
      "covered: Vice City Daily uploaded: Lucia's full story so far",
      'shown: Movie Recaps uploaded: Jason Bourne in 10 minutes',
    ]);
  });
});
