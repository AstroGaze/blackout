import { EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export interface CoverProps {
  topicName: string;
  onReveal: () => void;
}

/** The blur label over a Hidden Item, with a reveal that needs confirming. */
export function Cover({ topicName, onReveal }: CoverProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      role="group"
      aria-label={`Hidden by Blackout: ${topicName}`}
      className="dark flex size-full flex-col items-center justify-center gap-3 rounded-xl bg-background/75 p-4 text-center text-foreground"
    >
      <EyeOff className="size-5 text-muted-foreground" aria-hidden />
      <div className="space-y-0.5">
        <p className="text-xs text-muted-foreground">Hidden for</p>
        <p data-slot="cover-topic" className="text-sm font-semibold">
          {topicName}
        </p>
      </div>
      {confirming ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-muted-foreground">This may spoil {topicName}. Show it anyway?</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={onReveal}>
              Show
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(true)}>
          Reveal
        </Button>
      )}
    </div>
  );
}
