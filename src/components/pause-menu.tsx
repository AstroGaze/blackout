import type { ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PAUSE_DURATIONS, pauseTopic, updateProtection } from '@/protection/topics';

/** Opens the set Pause lengths for a topic; `children` is the button that opens it. */
export function PauseMenu({ topicId, children }: { topicId: string; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Pause for</DropdownMenuLabel>
        {PAUSE_DURATIONS.map((duration) => (
          <DropdownMenuItem
            key={duration.label}
            onSelect={() => updateProtection((state) => pauseTopic(state, topicId, Date.now() + duration.ms))}
          >
            {duration.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
