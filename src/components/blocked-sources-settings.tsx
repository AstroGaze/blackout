import { Ban } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { unblockSource } from '@/protection/blocked-sources';
import type { BlockedSource, Site } from '@/protection/state';
import { updateProtection } from '@/protection/topics';

const SITE_NAMES: Record<Site, string> = { youtube: 'YouTube', reddit: 'Reddit', x: 'X' };

/** The accounts whose content is always hidden, with a way to unblock each. */
export function BlockedSourcesSettings({ sources }: { sources: BlockedSource[] }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl leading-tight font-semibold tracking-tight">Blocked Sources</h1>
        <p className="text-muted-foreground leading-normal">
          Everything these accounts post is hidden, whatever it says, while any of your topics is
          protected.
        </p>
      </div>

      <section className="bg-card flex flex-col gap-4 rounded-2xl border p-6">
        {sources.length === 0 ? (
          <p className="text-muted-foreground">
            None yet. Choose “Block source” on a hidden video, or right-click any YouTube video,
            Short or comment and choose “Block this channel”.
          </p>
        ) : (
          <ul aria-label="Blocked Sources" className="flex flex-col divide-y rounded-lg border">
            {sources.map((source) => (
              <li key={`${source.site} ${source.account}`} className="flex items-center gap-3 px-3.5 py-2.5">
                <Ban className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{source.name}</span>
                  {source.name.toLowerCase() !== source.account && (
                    <span className="text-muted-foreground truncate text-[13px]">{source.account}</span>
                  )}
                </div>
                <Badge variant="outline" className="text-muted-foreground">
                  {SITE_NAMES[source.site]}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Unblock ${source.name}`}
                  onClick={() => updateProtection((state) => unblockSource(state, source))}
                >
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
