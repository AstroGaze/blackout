import { CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatWhen } from '@/lib/format';
import type { ProtectedTopic } from '@/protection/state';
import { changeTopic, updateProtection } from '@/protection/topics';
import { isRefreshing } from '@/refresh/refresh';
import { requestRefresh } from '@/refresh/schedule';
import { parseWikiAddress, wikiPageUrl } from '@/refresh/sources';

/**
 * How the topic's Related Terms are kept current: the daily refresh, "Refresh
 * now", and the sources Blackout reads, which the user can correct.
 */
export function RefreshCard({ topic, now, modelConnected }: { topic: ProtectedTopic; now: number; modelConnected: boolean }) {
  const refreshing = isRefreshing(topic, now);
  return (
    <section className="bg-card flex flex-col gap-4 rounded-2xl border p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base leading-none font-semibold">Refresh</h2>
          <RefreshStatus topic={topic} now={now} modelConnected={modelConnected} />
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!modelConnected || refreshing}
          onClick={() => void requestRefresh(topic.id)}
        >
          <RefreshCw />
          Refresh now
        </Button>
      </div>

      <div className="flex flex-col divide-y rounded-lg border">
        <WikiSource topic={topic} />
        <WikipediaSource topic={topic} />
      </div>
      <p className="text-muted-foreground text-[13px]">
        Blackout reads these for you in the background. You never see them.
      </p>
    </section>
  );
}

/** Whether the AI model is building the topic's terms, and how the last refresh went. */
function RefreshStatus({ topic, now, modelConnected }: { topic: ProtectedTopic; now: number; modelConnected: boolean }) {
  const { lastRefresh } = topic;
  if (!modelConnected) {
    return (
      <p className="text-muted-foreground">
        <a href="#model" className="text-foreground font-medium underline underline-offset-4">
          Connect an AI model
        </a>{' '}
        to have Blackout find characters, places and other names, and keep them current daily.
      </p>
    );
  }
  if (isRefreshing(topic, now)) {
    return (
      <p role="status" className="text-muted-foreground inline-flex items-center gap-1.5">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Building Related Terms with your AI model…
      </p>
    );
  }
  if (typeof topic.refreshingSince === 'number') {
    return (
      <p role="status" className="text-destructive inline-flex items-start gap-1.5">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        The refresh {formatWhen(topic.refreshingSince, now)} didn’t finish. The existing terms are kept.
      </p>
    );
  }
  if (lastRefresh && !lastRefresh.ok) {
    return (
      <p role="status" className="text-destructive inline-flex items-start gap-1.5">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        The refresh {formatWhen(lastRefresh.at, now)} failed. {lastRefresh.error}
      </p>
    );
  }
  if (lastRefresh) {
    const { added, sourcesRead } = lastRefresh;
    return (
      <p className="text-muted-foreground">
        Daily while active · last run {formatWhen(lastRefresh.at, now)} · {added} {added === 1 ? 'term' : 'terms'} added
        {sourcesRead.length === 0 && ' · from its name only, as no source could be read'}
      </p>
    );
  }
  return <p className="text-muted-foreground">Daily while active · not run yet</p>;
}

/** The topic's Fandom wiki, which the user can change or clear. */
function WikiSource({ topic }: { topic: ProtectedTopic }) {
  const wiki = topic.sources.wiki ? parseWikiAddress(topic.sources.wiki) : null;
  const shown = wiki ? `${new URL(wiki.base).hostname}${wiki.title ? ` · ${wiki.title}` : ''}` : null;
  return (
    <SourceRow
      label="Fandom wiki"
      badge="Weighted most"
      value={shown ?? (topic.lastRefresh ? 'None' : 'Found on the first refresh')}
      current={topic.sources.wiki ?? ''}
      placeholder="gta.fandom.com, or a page on it"
      onSave={(typed) => {
        if (typed === '') return saveSources(topic.id, { wiki: null });
        const address = parseWikiAddress(typed);
        if (!address) return 'Paste a Fandom wiki address, such as gta.fandom.com, or a page on it.';
        return saveSources(topic.id, {
          wiki: address.title ? wikiPageUrl(address.base, address.title) : `${address.base}/`,
        });
      }}
    />
  );
}

/** The topic's Wikipedia article; clearing it lets the next refresh search again. */
function WikipediaSource({ topic }: { topic: ProtectedTopic }) {
  const { wikipedia } = topic.sources;
  return (
    <SourceRow
      label="Wikipedia"
      value={wikipedia ?? (wikipedia === null ? 'None found' : 'Found automatically')}
      current={wikipedia ?? ''}
      placeholder="The article’s exact title"
      // An empty title lets the next refresh search for the article again.
      onSave={(typed) => saveSources(topic.id, { wikipedia: typed === '' ? undefined : typed })}
    />
  );
}

/** Stores the user's change to a source. Returns no problem, as `SourceRow` expects. */
function saveSources(topicId: string, sources: Partial<ProtectedTopic['sources']>): null {
  void updateProtection((state) =>
    changeTopic(state, topicId, (topic) => ({ ...topic, sources: { ...topic.sources, ...sources } })),
  );
  return null;
}

interface SourceRowProps {
  label: string;
  badge?: string;
  value: ReactNode;
  current: string;
  placeholder: string;
  /** Saves what was typed, or returns why it can't be used. */
  onSave: (typed: string) => string | null;
}

function SourceRow({ label, badge, value, current, placeholder, onSave }: SourceRowProps) {
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState(current);
  const [error, setError] = useState<string | null>(null);

  const save = (event: FormEvent) => {
    event.preventDefault();
    const problem = onSave(typed.trim());
    if (problem) return setError(problem);
    setEditing(false);
    setError(null);
  };

  if (editing) {
    return (
      <form onSubmit={save} className="flex flex-col gap-2 px-3.5 py-3">
        <label htmlFor={inputId} className="font-medium">
          {label}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id={inputId}
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              setError(null);
            }}
            placeholder={placeholder}
            autoFocus
            autoComplete="off"
            aria-invalid={error !== null}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className="max-w-sm flex-[1_1_220px]"
          />
          <Button type="submit" size="sm">
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
        {error && (
          <p id={`${inputId}-error`} className="text-destructive text-sm">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground truncate">{value}</span>
        {badge && <Badge variant="secondary">{badge}</Badge>}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setTyped(current);
          setEditing(true);
        }}
      >
        Change
      </Button>
    </div>
  );
}
