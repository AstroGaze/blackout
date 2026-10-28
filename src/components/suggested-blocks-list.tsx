import { Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSuggestedBlockCounts } from '@/lib/use-protection';
import { requestBlock } from '@/protection/blocked-sources';
import type { ProtectionState } from '@/protection/state';
import { ACCEPT_LABELS, pendingSuggestedBlocks, requestDismiss } from '@/protection/suggested-blocks';

/** The Suggested Blocks waiting for an answer, each blocked or dismissed with one click. */
export function SuggestedBlocksList({ state, now }: { state: ProtectionState; now: number }) {
  const counts = useSuggestedBlockCounts();
  if (!counts) return null;
  return pendingSuggestedBlocks(counts, state, now).map((suggestion) => (
    <div
      key={`${suggestion.source.site} ${suggestion.source.account}`}
      role="status"
      className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-[10px] border px-3.5 py-3"
    >
      <Ban className="mt-0.5 size-4" aria-hidden />
      <span className="leading-snug font-medium">Block {suggestion.source.name}?</span>
      <span />
      <span className="text-muted-foreground text-[13px] leading-normal">
        It posted {suggestion.count} {suggestion.topicName} items today.
      </span>
      <span />
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={() => void requestBlock(suggestion.source)}>
          {ACCEPT_LABELS[suggestion.source.site]}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void requestDismiss(suggestion.source)}>
          Not now
        </Button>
      </div>
    </div>
  ));
}
