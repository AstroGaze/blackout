import { Pause, Plus } from 'lucide-react';
import { useState } from 'react';
import { AddTopicDialog } from '@/components/add-topic-dialog';
import { Logo } from '@/components/logo';
import { PauseMenu } from '@/components/pause-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { formatTimeLeft } from '@/lib/format';
import { useNow, useProtectionState } from '@/lib/use-protection';
import type { ProtectedTopic } from '@/protection/state';
import { resumeTopic, setTopicEnabled, topicStatus, updateProtection } from '@/protection/topics';

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
          state.topics.map((topic) => <TopicCard key={topic.id} topic={topic} now={now} />)
        )}
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

function TopicCard({ topic, now }: { topic: ProtectedTopic; now: number }) {
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
            {status === 'off' ? 'Off · not protecting' : termSummary(topic)}
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
        </div>
      )}
    </section>
  );
}

function termSummary(topic: ProtectedTopic): string {
  return topic.terms.length === 0 ? 'Protected by its name' : `${topic.terms.length} terms`;
}
