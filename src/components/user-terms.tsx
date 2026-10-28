import { Plus, X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { ProtectedTopic } from '@/protection/state';
import {
  addUserTerm,
  removeUserTerm,
  setUserTermCommonWord,
  TermTextError,
  updateProtection,
  userTermHint,
  userTerms,
} from '@/protection/topics';

/**
 * The user's own Related Terms for a topic. They wrote them, so they're listed
 * openly, with no spoiler warning, and take effect on open pages straight away.
 */
export function UserTerms({ topic }: { topic: ProtectedTopic }) {
  const inputId = useId();
  const commonWordId = useId();
  const [text, setText] = useState('');
  const [commonWord, setCommonWord] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const terms = userTerms(topic);
  const hint = commonWord ? null : userTermHint(text, topic.name);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await updateProtection((state) => addUserTerm(state, topic.id, text, { commonWord }));
    } catch (failure) {
      if (failure instanceof TermTextError) return setError(failure.message);
      throw failure;
    }
    setText('');
    setCommonWord(false);
    setError(null);
  };

  return (
    <section className="bg-card flex flex-col gap-5 rounded-2xl border p-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base leading-none font-semibold">Your terms</h2>
        <p className="text-muted-foreground">
          Words or phrases you want hidden along with {topic.name}. Each one hides content on its
          own, unless you mark it as a common word.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2">
        <Label htmlFor={inputId} className="sr-only">
          Term
        </Label>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Input
            id={inputId}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setError(null);
            }}
            placeholder="A character, place or nickname"
            autoComplete="off"
            className="max-w-xs flex-[1_1_200px]"
            aria-invalid={error !== null}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          />
          <div className="flex items-center gap-2">
            <Switch id={commonWordId} checked={commonWord} onCheckedChange={setCommonWord} />
            <Label htmlFor={commonWordId} className="font-normal">
              Common word
            </Label>
          </div>
          <Button type="submit" variant="outline">
            <Plus />
            Add
          </Button>
        </div>
        {error && (
          <p id={`${inputId}-error`} className="text-destructive text-sm">
            {error}
          </p>
        )}
        {!error && hint && (
          <p id={`${inputId}-hint`} className="text-muted-foreground text-sm">
            {hint}
          </p>
        )}
      </form>

      {terms.length === 0 ? (
        <p className="text-muted-foreground">None yet.</p>
      ) : (
        <ul aria-label={`Your terms for ${topic.name}`} className="flex flex-col divide-y rounded-lg border">
          {terms.map((term) => (
            <UserTermRow key={term.text} topic={topic} text={term.text} weak={term.strength === 'weak'} />
          ))}
        </ul>
      )}
    </section>
  );
}

function UserTermRow({ topic, text, weak }: { topic: ProtectedTopic; text: string; weak: boolean }) {
  const commonWordId = useId();
  return (
    <li className="flex items-center gap-4 px-3.5 py-2">
      <span className="min-w-0 flex-1 truncate font-medium">{text}</span>
      <div className="flex items-center gap-2">
        <Switch
          id={commonWordId}
          checked={weak}
          onCheckedChange={(checked) =>
            updateProtection((state) => setUserTermCommonWord(state, topic.id, text, checked))
          }
        />
        <Label htmlFor={commonWordId} className="text-muted-foreground font-normal">
          Common word
        </Label>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${text}`}
        onClick={() => updateProtection((state) => removeUserTerm(state, topic.id, text))}
      >
        <X />
      </Button>
    </li>
  );
}
