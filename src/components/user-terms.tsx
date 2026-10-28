import { X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { TermChip } from '@/components/term-chip';
import { Label } from '@/components/ui/label';
import type { ProtectedTopic } from '@/protection/state';
import {
  addUserTerm,
  removeUserTerm,
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
    <section className="bg-card flex flex-col gap-4 rounded-2xl border p-6">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base leading-none font-semibold">Your own terms</h2>
        <p className="text-muted-foreground">
          You wrote these, so they’re shown without warnings. Refreshes never change them.
        </p>
      </div>

      {terms.length > 0 && (
        <ul aria-label={`Your own terms for ${topic.name}`} className="flex flex-wrap gap-2">
          {terms.map((term) => (
            <TermChip key={term.text} term={term}>
              <Button
                variant="ghost"
                aria-label={`Remove ${term.text}`}
                className="text-muted-foreground size-[22px] rounded-sm p-0"
                onClick={() => updateProtection((state) => removeUserTerm(state, topic.id, term.text))}
              >
                <X className="size-3.5" />
              </Button>
            </TermChip>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-[1_1_260px] flex-col gap-2">
            <Label htmlFor={inputId}>Add a term</Label>
            <Input
              id={inputId}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setError(null);
              }}
              placeholder="A name, place or phrase"
              autoComplete="off"
              aria-invalid={error !== null}
              aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            />
          </div>
          <div className="flex h-9 items-center gap-2">
            <Checkbox
              id={commonWordId}
              checked={commonWord}
              onCheckedChange={(checked) => setCommonWord(checked === true)}
            />
            <Label htmlFor={commonWordId}>This is a common word</Label>
          </div>
          <Button type="submit">Add</Button>
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
    </section>
  );
}
