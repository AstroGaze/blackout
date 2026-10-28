import { CircleAlert, LoaderCircle, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AddTopicDialog } from '@/components/add-topic-dialog';
import { Logo } from '@/components/logo';
import { ModelSettings } from '@/components/model-settings';
import { PauseMenu } from '@/components/pause-menu';
import { SPOILER_LEVEL_LABELS, TermViewer } from '@/components/term-viewer';
import { UserTerms } from '@/components/user-terms';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatTimeLeft, formatWhen } from '@/lib/format';
import { useNow, useProtectionState } from '@/lib/use-protection';
import { GTA6_PRESET, type ProtectedTopic } from '@/protection/state';
import { isRefreshing } from '@/refresh/refresh';
import {
  aiTermsByLevel,
  deleteTopic,
  resumeTopic,
  setTopicEnabled,
  SPOILER_LEVELS,
  topicStatus,
  updateProtection,
  userTerms,
} from '@/protection/topics';

/** The settings sections, by the address hash that opens each. */
const SECTIONS = [
  { hash: '', label: 'Protected Topics' },
  { hash: '#model', label: 'AI model' },
] as const;

/** The address hash, kept current as it changes. */
function useHash(): string {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const update = () => setHash(location.hash);
    addEventListener('hashchange', update);
    return () => removeEventListener('hashchange', update);
  }, []);
  return hash;
}

export function App() {
  const state = useProtectionState();
  const hash = useHash();
  const now = useNow();
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!state) return null;

  const selected =
    state.topics.find((topic) => topic.id === selectedId) ?? state.topics[0] ?? null;

  const addButton = (
    <AddTopicDialog
      open={adding}
      onOpenChange={setAdding}
      onAdded={(topic) => setSelectedId(topic.id)}
    >
      <Button variant="outline">
        <Plus />
        Add topic
      </Button>
    </AddTopicDialog>
  );

  return (
    <div className="flex min-h-screen flex-wrap items-stretch text-sm">
      <nav aria-label="Settings sections" className="bg-card flex max-w-64 flex-[1_1_220px] flex-col gap-0.5 border-r px-2 py-4">
        <div className="px-2 pt-1 pb-4">
          <Logo />
        </div>
        <span className="text-muted-foreground px-2 pt-2 pb-1 text-xs font-medium">Settings</span>
        {SECTIONS.map((section) => (
          <a
            key={section.hash}
            href={section.hash || '#'}
            aria-current={section.hash === hash || (section.hash === '' && hash === '#') ? 'page' : undefined}
            className="hover:bg-muted/60 aria-[current=page]:bg-muted text-foreground/85 aria-[current=page]:text-foreground flex h-8 items-center rounded-md px-2 aria-[current=page]:font-medium"
          >
            {section.label}
          </a>
        ))}
      </nav>

      <main className="flex max-w-[920px] min-w-0 flex-[999_1_560px] flex-col gap-6 px-6 py-8">
        {hash === '#model' ? (
          <ModelSettings connection={state.modelConnection} />
        ) : selected === null ? (
          <section className="bg-card flex flex-col items-start gap-4 rounded-2xl border p-6">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-xl font-semibold">Nothing is protected yet</h1>
              <p className="text-muted-foreground">
                Add the game, film, series or book you want to avoid spoilers for.
              </p>
            </div>
            {addButton}
          </section>
        ) : (
          <Tabs value={selected.id} onValueChange={setSelectedId} className="gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList aria-label="Protected Topics">
                {state.topics.map((topic) => (
                  <TabsTrigger key={topic.id} value={topic.id} className="px-3">
                    {topic.name}
                  </TabsTrigger>
                ))}
              </TabsList>
              {addButton}
            </div>
            {state.topics.map((topic) => (
              <TabsContent key={topic.id} value={topic.id} className="flex flex-col gap-6">
                <TopicPanel topic={topic} now={now} modelConnected={state.modelConnection !== null} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </main>
    </div>
  );
}

function TopicPanel({
  topic,
  now,
  modelConnected,
}: {
  topic: ProtectedTopic;
  now: number;
  modelConnected: boolean;
}) {
  const status = topicStatus(topic, now);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight">{topic.name}</h1>
          <div className="flex flex-wrap gap-1.5">
            {status === 'on' && <Badge>Protected</Badge>}
            {status === 'paused' && (
              <Badge variant="secondary">Paused · back on in {formatTimeLeft(topic.pausedUntil!, now)}</Badge>
            )}
            {status === 'off' && <Badge variant="outline">Off</Badge>}
            <Badge variant="outline">Strict Mode</Badge>
            {topic.id === GTA6_PRESET.id && (
              <Badge variant="outline" className="text-muted-foreground">
                Ready-made
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {status === 'on' && (
            <PauseMenu topicId={topic.id}>
              <Button variant="outline">Pause…</Button>
            </PauseMenu>
          )}
          {status === 'paused' && (
            <Button variant="outline" onClick={() => updateProtection((state) => resumeTopic(state, topic.id))}>
              Resume
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => updateProtection((state) => setTopicEnabled(state, topic.id, status === 'off'))}
          >
            {status === 'off' ? 'Turn on' : 'Turn off'}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {topic.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Blackout stops protecting it and forgets its Related Terms. Content about it shows
                  again on open pages.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className={buttonVariants({ variant: 'destructive' })}
                  onClick={() => updateProtection((state) => deleteTopic(state, topic.id))}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <RelatedTermsSummary topic={topic} now={now} modelConnected={modelConnected} />
      <UserTerms topic={topic} />
    </>
  );
}

/**
 * How many Related Terms the topic has per Spoiler Level, with the terms themselves
 * behind the term viewer.
 */
function RelatedTermsSummary({
  topic,
  now,
  modelConnected,
}: {
  topic: ProtectedTopic;
  now: number;
  modelConnected: boolean;
}) {
  const levels = aiTermsByLevel(topic);
  const hasGeneratedTerms = SPOILER_LEVELS.some((level) => levels[level].length > 0);
  const andYours = userTerms(topic).length > 0 ? ', and by your own terms' : '';
  return (
    <section className="bg-card flex flex-col gap-5 rounded-2xl border p-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base leading-none font-semibold">Related Terms</h2>
        <p className="text-muted-foreground">
          {hasGeneratedTerms
            ? 'Hidden to protect you.'
            : `None yet. ${topic.name} is protected by its name, including its spacing and hashtag variants${andYours}.`}
        </p>
        <RefreshStatus topic={topic} now={now} modelConnected={modelConnected} />
      </div>
      {hasGeneratedTerms && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {SPOILER_LEVELS.map((level) => (
              <div key={level} className="flex flex-col gap-1 rounded-lg border p-3.5">
                <span className="text-muted-foreground text-[13px]">{SPOILER_LEVEL_LABELS[level]}</span>
                <span className="text-2xl font-semibold">{levels[level].length}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <TermViewer topic={topic}>
              <Button>View terms…</Button>
            </TermViewer>
            <span className="text-muted-foreground text-[13px]">Opens behind a warning, least revealing first.</span>
          </div>
        </>
      )}
    </section>
  );
}

/** Whether the AI model is building the topic's terms, and how the last time went. */
function RefreshStatus({ topic, now, modelConnected }: { topic: ProtectedTopic; now: number; modelConnected: boolean }) {
  const { lastRefresh } = topic;
  if (isRefreshing(topic, now)) {
    return (
      <p role="status" className="text-muted-foreground inline-flex items-center gap-1.5 text-[13px]">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Building Related Terms with your AI model…
      </p>
    );
  }
  if (typeof topic.refreshingSince === 'number') {
    return (
      <p role="status" className="text-destructive inline-flex items-start gap-1.5 text-[13px]">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        Building Related Terms {formatWhen(topic.refreshingSince, now)} didn’t finish. The existing terms are kept.
      </p>
    );
  }
  if (lastRefresh && !lastRefresh.ok) {
    return (
      <p role="status" className="text-destructive inline-flex items-start gap-1.5 text-[13px]">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        Couldn’t build Related Terms {formatWhen(lastRefresh.at, now)}. {lastRefresh.error}
      </p>
    );
  }
  if (lastRefresh) {
    const { added, sourcesRead: sources } = lastRefresh;
    return (
      <p className="text-muted-foreground text-[13px]">
        Built by your AI model {formatWhen(lastRefresh.at, now)} · {added} {added === 1 ? 'term' : 'terms'} added
        {sources.length > 0
          ? ` · from ${sources.join(', ')}`
          : ' · from its name only, as no background material could be read'}
      </p>
    );
  }
  if (!modelConnected) {
    return (
      <p className="text-muted-foreground text-[13px]">
        <a href="#model" className="text-foreground font-medium underline underline-offset-4">
          Connect an AI model
        </a>{' '}
        to have Blackout find characters, places and other names for new topics.
      </p>
    );
  }
  return null;
}
