import { saveSources, SourceRow } from '@/components/refresh-card';
import type { ProtectedTopic } from '@/protection/state';
import { subredditName } from '@/protection/subreddits';

/**
 * The topic's own subreddit. Blackout doesn't read it; on Reddit, everything
 * posted there counts as about the topic, so its Weak Terms hide on their own.
 */
export function TopicSubreddit({ topic }: { topic: ProtectedTopic }) {
  const { subreddit } = topic.sources;
  return (
    <section className="bg-card flex flex-col gap-4 rounded-2xl border p-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base leading-none font-semibold">On Reddit</h2>
        <p className="text-muted-foreground">
          Posts and comments in {topic.name}’s own subreddit count as about it, so even a name
          that is also a common word hides them there.
        </p>
      </div>
      <div className="rounded-lg border">
        <SourceRow
          label="Subreddit"
          value={subreddit ? `r/${subreddit}` : 'None'}
          current={subreddit ? `r/${subreddit}` : ''}
          placeholder="r/GTA6"
          onSave={(typed) => {
            if (typed === '') return saveSources(topic.id, { subreddit: null });
            const name = subredditName(typed);
            if (!name) return 'Type a subreddit’s name, such as r/GTA6.';
            return saveSources(topic.id, { subreddit: name });
          }}
        />
      </div>
    </section>
  );
}
