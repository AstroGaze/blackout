import { Pause, Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { AddTopicDialog } from '@/components/add-topic-dialog';
import { BlurThumbnailsSwitch } from '@/components/blur-thumbnails-switch';
import { Logo } from '@/components/logo';
import { PauseMenu } from '@/components/pause-menu';
import { SuggestedBlocksList } from '@/components/suggested-blocks-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { formatAgo, formatTimeLeft } from '@/lib/format';
import { useNow, useProtectionState } from '@/lib/use-protection';
import type { ProtectedTopic } from '@/protection/state';
import { resumeTopic, setTopicEnabled, topicStatus, updateProtection } from '@/protection/topics';
import { isRefreshing } from '@/refresh/refresh';
import { requestRefresh } from '@/refresh/schedule';

export function App() {
  const state = useProtectionState();
  const now = useNow();
  const [adding, setAdding] = useState(false);
  if (!state) return null;

  const active = state.topics.filter((topic) => topicStatus(topic, now) === 'on').length;

  return (
    <div className="flex min-h-[480px] w-[360px] flex-col text-sm">
      <header className="flex items-center justify-between border-b p-4">
        <Logo />
        {state.topics.length > 0 && (
          <Badge variant="outline" className="text-muted-foreground">
            {active} of {state.topics.length} active
          </Badge>
        )}
      </header>

      <main className="flex grow flex-col gap-3 p-4">
        {state.topics.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">
            Nothing is protected yet. Add the game, film, series or book you want to avoid
            spoilers for.
          </p>
        ) : (
          state.topics.map((topic) => (
            <TopicCard key={topic.id} topic={topic} now={now} modelConnected={state.modelConnection !== null} />
          ))
        )}
        <SuggestedBlocksList state={state} now={now} />
        <div className="bg-border h-px" />
        <BlurThumbnailsSwitch on={state.blurAllThumbnails} description="Turn on for launch week" />
      </main>

      <footer className="flex gap-2 border-t p-4">
        <AddTopicDialog open={adding} onOpenChange={setAdding}>
          <Button className="grow">
            <Plus />
            Add topic
          </Button>
        </AddTopicDialog>
        <Button variant="outline" className="grow" onClick={() => browser.runtime.openOptionsPage()}>
          Settings
        </Button>
      </footer>
    </div>
  );
}

function TopicCard({ topic, now, modelConnected }: { topic: ProtectedTopic; now: number; modelConnected: boolean }) {
  const status = topicStatus(topic, now);

  if (status === 'paused') {
    return (
      <section className="bg-card flex items-center justify-between gap-3 rounded-xl border p-3.5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="leading-none font-semibold">{topic.name}</h2>
            <Badge variant="secondary">Paused</Badge>
          </div>
          <span className="text-muted-foreground text-[13px]">
            Back on in {formatTimeLeft(topic.pausedUntil!, now)}
            {refreshSummary(topic, now) && ` · ${refreshSummary(topic, now)}`}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => updateProtection((state) => resumeTopic(state, topic.id))}>
          Resume
        </Button>
      </section>
    );
  }

  return (
    <section className="bg-card flex flex-col rounded-xl border">
      <div className="flex items-center justify-between gap-3 px-3.5 pt-3.5 pb-3">
        <div className="flex flex-col gap-1">
          <h2 className="leading-none font-semibold">{topic.name}</h2>
          <span className="text-muted-foreground text-[13px]">
            {status === 'off' ? 'Off · not protecting' : termSummary(topic, now)}
          </span>
        </div>
        <Switch
          checked={status === 'on'}
          onCheckedChange={(on) => updateProtection((state) => setTopicEnabled(state, topic.id, on))}
          aria-label={`Protect ${topic.name}`}
        />
      </div>
      {status === 'on' && (
        <div className="flex gap-2 px-3.5 pb-3.5">
          <PauseMenu topicId={topic.id}>
            <Button variant="outline" size="sm" className="grow">
              <Pause />
              Pause
            </Button>
          </PauseMenu>
          {modelConnected && (
            <Button
              variant="outline"
              size="sm"
              className="grow"
              disabled={isRefreshing(topic, now)}
              onClick={() => void requestRefresh(topic.id)}
            >
              <RefreshCw className={isRefreshing(topic, now) ? 'animate-spin' : undefined} />
              Refresh
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/** "214 terms · refreshed 6 h ago": what protects the topic, and how current it is. */
function termSummary(topic: ProtectedTopic, now: number): string {
  const terms = topic.terms.length === 0 ? 'Protected by its name' : `${topic.terms.length} terms`;
  const refresh = refreshSummary(topic, now);
  return refresh ? `${terms} · ${refresh}` : terms;
}

/** "refreshed 6 h ago", "refresh failed 2 h ago" or "refreshing…"; null before the first refresh. */
function refreshSummary(topic: ProtectedTopic, now: number): string | null {
  if (isRefreshing(topic, now)) return 'refreshing…';
  const { lastRefresh } = topic;
  if (!lastRefresh) return null;
  return lastRefresh.ok ? `refreshed ${formatAgo(lastRefresh.at, now)}` : `refresh failed ${formatAgo(lastRefresh.at, now)}`;
}
