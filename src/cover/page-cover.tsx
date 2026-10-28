import { Ban, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { CoverReason } from './cover';

export interface PageCoverProps {
  /**
   * The topic the page is about or the Blocked Source it comes from, or null when
   * Blackout couldn't check the page.
   */
  reason: CoverReason | null;
  onContinue: () => void;
  onGoBack: () => void;
  /** Blocks the source of a page covered for a topic, when the site shows it. */
  onBlockSource?: () => void;
  /** Unblocks the Blocked Source the page comes from. */
  onUnblock?: () => void;
}

/** Covers a whole page that is about a Protected Topic, with a confirm to continue. */
export function PageCover({ reason, onContinue, onGoBack, onBlockSource, onUnblock }: PageCoverProps) {
  const [confirming, setConfirming] = useState(false);
  const blocked = reason !== null && 'sourceName' in reason;
  const name = reason === null ? 'Unchecked page' : blocked ? 'Blocked Source' : reason.topicName;
  const Icon = blocked ? Ban : EyeOff;

  const intro = reason === null ? 'Blackout couldn’t check this page' : blocked ? 'This page comes from a' : 'This page is about';
  const warning = blocked
    ? 'It comes from a source you blocked. Continue anyway?'
    : `This may spoil ${reason === null ? 'something you protect' : name}. Continue anyway?`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={reason === null ? 'Hidden by Blackout' : `Hidden by Blackout: ${name}`}
      className="dark flex size-full items-center justify-center bg-background p-6 text-foreground"
    >
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <Icon className="size-8 text-muted-foreground" aria-hidden />
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{intro}</p>
          <p data-slot="cover-topic" className="text-2xl font-semibold">
            {name}
          </p>
          {blocked && <p className="text-sm text-muted-foreground">{reason.sourceName}</p>}
        </div>
        <p className="text-sm text-muted-foreground">
          {confirming ? warning : 'Blackout covered it so nothing here can spoil it for you.'}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {confirming ? (
            <>
              <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={onContinue}>
                Continue
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={onGoBack}>
                Go back
              </Button>
              {onUnblock && (
                <Button type="button" variant="outline" onClick={onUnblock}>
                  Unblock
                </Button>
              )}
              {onBlockSource && (
                <Button type="button" variant="outline" onClick={onBlockSource}>
                  Block source
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
                Continue to page
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
