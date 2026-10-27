import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { startPageGuard, type PageGuard } from '@/guard/page-guard';
import { protectionState } from '@/protection/state';
import { renderPage, settle } from '@/test/page';
import { gta6, stateWithTopics, topic } from '@/test/state';
import { youtube } from './adapter';
import notifications from './fixtures/notifications.html?raw';
import { viewItems } from './fixtures/view';

const NOTIFICATION = 'ytd-notification-renderer';

let guard: PageGuard | undefined;

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => guard?.stop());

/** Opens the notifications menu (saved from a signed-in session) and lists what it shows. */
async function viewNotifications() {
  guard = startPageGuard(youtube);
  renderPage(notifications);
  await settle();
  // YouTube writes some accents as separate characters; compare in one form.
  return viewItems(NOTIFICATION).map(({ title, state }) => `${state}: ${title}`.normalize('NFC'));
}

describe('YouTube notifications', () => {
  it('shows every notification when none is about GTA 6', async () => {
    const views = await viewNotifications();

    expect(views).toHaveLength(11);
    expect(views.every((view) => view.startsWith('shown: '))).toBe(true);
  });

  it('covers the notifications about another Protected Topic', async () => {
    await protectionState.setValue(
      stateWithTopics(gta6(), topic('Star Citizen', { strong: ['Star Citizen'] })),
    );

    expect(await viewNotifications()).toEqual([
      "shown: Cobra TV (COBRA T.V.) subió: No Man's Sky News & Updates: Why the Roses, Sean? 🥀",
      "shown: Cobra TV (COBRA T.V.) subió: Returning to No Man's Sky: A New Adventure Begins!",
      'covered: Cobra TV (COBRA T.V.) subió: The Darkest Story in Star Citizen | A Halloween Special',
      'shown: SuicideSheeep subió: DJ Seinfeld - Everything U',
      'covered: Cobra TV (COBRA T.V.) subió: Star Citizen: Can It Still Make Me Feel Like a New Player? (Not a Tutorial!)',
      'shown: SuicideSheeep subió: Archangel - From The Ashes',
      'shown: SuicideSheeep subió: Ben Böhmer, Nils Hoffmann & Malou - Breathing (orbit Remix)',
      'covered: Cobra TV (COBRA T.V.) subió: My Wife Fought the Yormandi in Star Citizen… It Went Bad #starcitizengameplay #gaming',
      'covered: Cobra TV (COBRA T.V.) subió: Star Citizen Yormandi Fight With My Wife | Our Adventure Went Horribly Wrong',
      'covered: Cobra TV (COBRA T.V.) subió: Star Citizen Planet Exploration With My Wife | Yormandi & Hidden Locations',
      'shown: SuicideSheeep subió: QZB - Surface Tension',
    ]);
  });
});
