import { EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export interface PageCoverProps {
  /** The topic the page is about, or null when Blackout couldn't check the page. */
  topicName: string | null;
  onContinue: () => void;
  onGoBack: () => void;
}

/** Covers a whole page that is about a Protected Topic, with a confirm to continue. */
export function PageCover({ topicName, onContinue, onGoBack }: PageCoverProps) {
  const [confirming, setConfirming] = useState(false);
  const spoils = topicName ?? 'something you protect';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={topicName ? `Hidden by Blackout: ${topicName}` : 'Hidden by Blackout'}
      className="dark flex size-full items-center justify-center bg-background p-6 text-foreground"
    >
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <EyeOff className="size-8 text-muted-foreground" aria-hidden />
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {topicName ? 'This page is about' : 'Blackout couldn’t check this page'}
          </p>
          <p data-slot="cover-topic" className="text-2xl font-semibold">
            {topicName ?? 'Unchecked page'}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          {confirming
            ? `This may spoil ${spoils}. Continue anyway?`
            : 'Blackout covered it so nothing here can spoil it for you.'}
        </p>
        <div className="flex gap-2">
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
