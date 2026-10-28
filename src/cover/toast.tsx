import { Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ToastProps {
  title: string;
  text: string;
  acceptLabel: string;
  onAccept: () => void;
  onDismiss: () => void;
}

/** A Suggested Block, offered in a corner of the page. Nothing happens without a click. */
export function Toast({ title, text, acceptLabel, onAccept, onDismiss }: ToastProps) {
  return (
    <div
      role="status"
      className="dark flex w-[356px] max-w-[calc(100vw-48px)] flex-col gap-3 rounded-[10px] border bg-background p-4 text-sm text-foreground shadow-lg"
    >
      <div className="flex gap-2.5">
        <Ban className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="flex flex-col gap-1">
          <span data-slot="toast-title" className="font-medium">
            {title}
          </span>
          <span data-slot="toast-text" className="text-[13px] text-muted-foreground">
            {text}
          </span>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
          Not now
        </Button>
        <Button type="button" size="sm" onClick={onAccept}>
          {acceptLabel}
        </Button>
      </div>
    </div>
  );
}
