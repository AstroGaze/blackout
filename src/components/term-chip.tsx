import type { ReactNode } from 'react';
import type { RelatedTerm } from '@/protection/state';

/** A Related Term as a chip, labelled "common word" when it is Weak. */
export function TermChip({ term, children }: { term: RelatedTerm; children?: ReactNode }) {
  return (
    <li className="bg-muted inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium has-[button]:pr-1">
      {term.text}
      {term.strength === 'weak' && (
        <span className="text-muted-foreground text-xs font-normal">common word</span>
      )}
      {children}
    </li>
  );
}
