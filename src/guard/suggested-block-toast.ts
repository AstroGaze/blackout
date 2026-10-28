import { mountToast, unmountToast } from '@/cover/mount';
import { requestBlock } from '@/protection/blocked-sources';
import type { ProtectionState, Site } from '@/protection/state';
import {
  ACCEPT_LABELS,
  pendingSuggestedBlocks,
  requestDismiss,
  suggestedBlockCounts,
  type SuggestedBlockCounts,
} from '@/protection/suggested-blocks';

export interface SuggestedBlockOffer {
  /** Shows or takes down the toast after the protection state changed. */
  refresh(): void;
  stop(): void;
}

/** Milliseconds until the next local midnight, when today's suggestions end. */
function untilMidnight(now = Date.now()): number {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now;
}

/**
 * Offers this site's waiting Suggested Blocks on the page, one at a time, as a
 * toast. Accepting or dismissing it anywhere takes it down everywhere.
 */
export function offerSuggestedBlocks(
  doc: Document,
  site: Site,
  latestState: () => ProtectionState | null,
): SuggestedBlockOffer {
  let counts: SuggestedBlockCounts | null = null;
  let stopped = false;
  let midnightTimer: ReturnType<typeof setTimeout> | undefined;

  const refresh = () => {
    const state = latestState();
    if (stopped || !state || !counts) return;
    clearTimeout(midnightTimer);
    const offer = pendingSuggestedBlocks(counts, state).find((pending) => pending.source.site === site);
    if (!offer) return unmountToast(doc);
    mountToast(doc, {
      title: `Block ${offer.source.name}?`,
      text: `Blackout hid ${offer.count} of its ${offer.topicName} items today.`,
      acceptLabel: ACCEPT_LABELS[site],
      onAccept: () => void requestBlock(offer.source),
      onDismiss: () => void requestDismiss(offer.source),
    });
    // A suggestion lasts for its day.
    midnightTimer = setTimeout(refresh, untilMidnight());
  };

  void suggestedBlockCounts.getValue().then((value) => {
    counts = value;
    refresh();
  });
  const stopWatching = suggestedBlockCounts.watch((value) => {
    counts = value;
    refresh();
  });

  return {
    refresh,
    stop() {
      stopped = true;
      clearTimeout(midnightTimer);
      stopWatching();
      unmountToast(doc);
    },
  };
}
