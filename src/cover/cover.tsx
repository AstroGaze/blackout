import { Ban, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { HideReason } from '@/matcher/matcher';

/** How a cover is laid out: a card over tiles, a single row over lines of text. */
export type CoverLayout = 'card' | 'inline';

/** What a cover names: the Protected Topic an item is about, or the Blocked Source it comes from. */
export type CoverReason = { topicName: string } | { sourceName: string };

export function coverReason(reason: HideReason): CoverReason {
  return reason.kind === 'topic' ? { topicName: reason.topicName } : { sourceName: reason.source.name };
}

export interface CoverProps {
  layout: CoverLayout;
  reason: CoverReason;
  /** Hides everything behind the cover, as over a preview lying on top of its tile. */
  opaque?: boolean;
  onReveal: () => void;
  /** Blocks the item's source, when the site shows it. */
  onBlockSource?: () => void;
  /** Unblocks the Blocked Source the item comes from. */
  onUnblock?: () => void;
}

/** The blur label over a Hidden Item, with a reveal that needs confirming. */
export function Cover({ layout, reason, opaque = false, onReveal, onBlockSource, onUnblock }: CoverProps) {
  const [confirming, setConfirming] = useState(false);
  const blocked = 'sourceName' in reason;
  const name = blocked ? 'Blocked Source' : reason.topicName;
  const buttonSize = layout === 'card' ? 'sm' : 'xs';
  const label = `Hidden by Blackout: ${blocked ? `Blocked Source, ${reason.sourceName}` : name}`;
  const Icon = blocked ? Ban : EyeOff;
  const title = (
    <span data-slot="cover-topic" className="font-semibold">
      {name}
    </span>
  );
  const warning = blocked
    ? 'It comes from a source you blocked. Show it anyway?'
    : `This may spoil ${name}. Show it anyway?`;
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
  const sourceAction = blocked
    ? onUnblock && (
        <Button type="button" size={buttonSize} variant="outline" onClick={onUnblock}>
          Unblock
        </Button>
      )
    : onBlockSource && (
        <Button type="button" size={buttonSize} variant="outline" onClick={onBlockSource}>
          Block source
        </Button>
      );

  if (layout === 'inline') {
    return (
      <div
        role="group"
        aria-label={label}
        className="dark flex size-full items-center gap-2 overflow-hidden rounded-md bg-background/85 px-2 text-xs text-foreground"
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          <span className="text-muted-foreground">{blocked ? 'Hidden · ' : 'Hidden for '}</span>
          {title}
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
      className={cn(
        'dark size-full rounded-xl text-center text-foreground [container:cover/size]',
        opaque ? 'bg-background' : 'bg-background/75',
      )}
    >
      {/* Over a small item, only the topic and the buttons that reveal it fit; over a tall one, it sits near the top. */}
      <div className="flex size-full flex-col items-center justify-center gap-3 overflow-hidden p-4 compact:gap-1.5 compact:p-1.5 tall:justify-start tall:pt-20">
        <Icon className="size-5 shrink-0 text-muted-foreground compact:hidden" aria-hidden />
        <div className="max-w-full space-y-0.5">
          {!blocked && <p className="text-xs text-muted-foreground compact:hidden">Hidden for</p>}
          <p className="truncate text-sm compact:text-xs">{title}</p>
          {blocked && <p className="truncate text-xs text-muted-foreground compact:hidden">{reason.sourceName}</p>}
        </div>
        {confirming ? (
          <div className="flex flex-col items-center gap-2 compact:gap-1">
            <p className="text-xs text-muted-foreground compact:hidden">{warning}</p>
            <div className="flex flex-wrap justify-center gap-2 compact:gap-1">
              {cancel}
              {show}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-2">
            {reveal}
            {sourceAction && <span className="contents compact:hidden">{sourceAction}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
