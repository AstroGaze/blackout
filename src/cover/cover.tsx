import { EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/** How a cover is laid out: a card over tiles, a single row over lines of text. */
export type CoverLayout = 'card' | 'inline';

export interface CoverProps {
  layout: CoverLayout;
  topicName: string;
  onReveal: () => void;
}

/** The blur label over a Hidden Item, with a reveal that needs confirming. */
export function Cover({ layout, topicName, onReveal }: CoverProps) {
  const [confirming, setConfirming] = useState(false);
  const buttonSize = layout === 'card' ? 'sm' : 'xs';
  const label = `Hidden by Blackout: ${topicName}`;
  const topic = (
    <span data-slot="cover-topic" className="font-semibold">
      {topicName}
    </span>
  );
  const cancel = (
    <Button type="button" size={buttonSize} variant="secondary" onClick={() => setConfirming(false)}>
      Cancel
    </Button>
  );
  const show = (
    <Button type="button" size={buttonSize} variant="destructive" onClick={onReveal}>
      Show
    </Button>
  );
  const reveal = (
    <Button type="button" size={buttonSize} variant="secondary" onClick={() => setConfirming(true)}>
      Reveal
    </Button>
  );

  if (layout === 'inline') {
    return (
      <div
        role="group"
        aria-label={label}
        className="dark flex size-full items-center gap-2 overflow-hidden rounded-md bg-background/85 px-2 text-xs text-foreground"
      >
        <EyeOff className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          <span className="text-muted-foreground">Hidden for </span>
          {topic}
          {confirming && <span className="text-muted-foreground"> · Show it anyway?</span>}
        </span>
        {confirming ? (
          <>
            {cancel}
            {show}
          </>
        ) : (
          reveal
        )}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={label}
      className="dark flex size-full flex-col items-center justify-center gap-3 rounded-xl bg-background/75 p-4 text-center text-foreground"
    >
      <EyeOff className="size-5 text-muted-foreground" aria-hidden />
      <div className="space-y-0.5">
        <p className="text-xs text-muted-foreground">Hidden for</p>
        <p className="text-sm">{topic}</p>
      </div>
      {confirming ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-muted-foreground">This may spoil {topicName}. Show it anyway?</p>
          <div className="flex gap-2">
            {cancel}
            {show}
          </div>
        </div>
      ) : (
        reveal
      )}
    </div>
  );
}
