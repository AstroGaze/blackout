import { Info } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { TermChip } from '@/components/term-chip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { ProtectedTopic, RelatedTerm, SpoilerLevel } from '@/protection/state';
import { aiTermsByLevel, SPOILER_LEVELS } from '@/protection/topics';

export const SPOILER_LEVEL_LABELS: Record<SpoilerLevel, string> = {
  common: 'Common knowledge',
  minor: 'Minor',
  major: 'Major',
};

const SPOILER_LEVEL_DESCRIPTIONS: Record<SpoilerLevel, string> = {
  common: 'Its name, other names, and what trailers and marketing already showed.',
  minor: 'Side characters, factions and places that weren’t in the marketing.',
  major: 'What comes late in the story: deaths, twists and endings, plus anything Blackout wasn’t sure about.',
};

interface TermViewerProps {
  topic: ProtectedTopic;
  /** The button that opens the viewer. */
  children: ReactNode;
}

/**
 * Shows a topic's AI-added Related Terms behind a warning, one Spoiler Level at a
 * time, least revealing first. Closing it, or leaving the page, hides them all again.
 */
export function TermViewer({ topic, children }: TermViewerProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => document.visibilityState === 'hidden' && setOpen(false);
    document.addEventListener('visibilitychange', close);
    return () => document.removeEventListener('visibilitychange', close);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto sm:max-w-[640px]">
        {/* Mounted only while open, so every level starts hidden each time. */}
        <TermLevels topic={topic} />
      </DialogContent>
    </Dialog>
  );
}

function TermLevels({ topic }: { topic: ProtectedTopic }) {
  const [shown, setShown] = useState<ReadonlySet<SpoilerLevel>>(new Set());
  const levels = aiTermsByLevel(topic);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{topic.name} · Related Terms</DialogTitle>
        <DialogDescription>What Blackout watches for, least revealing first.</DialogDescription>
      </DialogHeader>

      <div role="note" className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border px-3.5 py-3">
        <Info className="mt-0.5 size-4" aria-hidden />
        <span className="font-medium">Most of these don’t spoil anything</span>
        <span />
        <span className="text-muted-foreground leading-normal">
          They’re mostly names, places and factions, but some do give things away. Each level
          opens separately, and you can stop at any point.
        </span>
      </div>

      <div className="flex flex-col divide-y rounded-lg border">
        {SPOILER_LEVELS.map((level, index) => {
          // A level opens once every less revealing level with terms has been shown.
          const lockedBy = SPOILER_LEVELS.slice(0, index).find(
            (earlier) => levels[earlier].length > 0 && !shown.has(earlier),
          );
          return (
            <LevelSection
              key={level}
              level={level}
              terms={levels[level]}
              shown={shown.has(level)}
              lockedBy={lockedBy}
              onShow={() => setShown(new Set(shown).add(level))}
            />
          );
        })}
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button>Done</Button>
        </DialogClose>
      </DialogFooter>
    </>
  );
}

interface LevelSectionProps {
  level: SpoilerLevel;
  terms: RelatedTerm[];
  shown: boolean;
  /** The less revealing level to show first, if any. */
  lockedBy: SpoilerLevel | undefined;
  onShow: () => void;
}

function LevelSection({ level, terms, shown, lockedBy, onShow }: LevelSectionProps) {
  const label = SPOILER_LEVEL_LABELS[level];
  const count = `${terms.length} ${terms.length === 1 ? 'term' : 'terms'}`;
  const status = terms.length === 0 ? 'none' : shown ? 'open' : lockedBy ? 'locked' : 'hidden';

  return (
    <section aria-label={label} className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{label}</h3>
        {status === 'open' ? (
          <Badge>{count} · open</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            {status === 'none' ? 'None' : `${count} · ${status}`}
          </Badge>
        )}
      </div>
      <p className="text-muted-foreground">{SPOILER_LEVEL_DESCRIPTIONS[level]}</p>

      {status === 'open' && (
        <ul aria-label={`${label} terms`} className="flex flex-wrap gap-1.5">
          {terms.map((term) => (
            <TermChip key={term.text} term={term} />
          ))}
        </ul>
      )}

      {status === 'hidden' && (
        <>
          <div className="flex flex-wrap gap-1.5" aria-hidden>
            {[96, 132, 80, 116].map((width) => (
              <span key={width} className="bg-muted/60 block h-7 rounded-md" style={{ width }} />
            ))}
          </div>
          <Button variant="outline" size="sm" className="self-start" onClick={onShow}>
            Show {label} terms
          </Button>
        </>
      )}

      {status === 'locked' && (
        <Button variant="outline" size="sm" className="self-start" disabled>
          Open {SPOILER_LEVEL_LABELS[lockedBy!]} first
        </Button>
      )}
    </section>
  );
}
