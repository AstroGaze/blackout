import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { normalize } from '@/matcher/matcher';
import type { ProtectedTopic } from '@/protection/state';
import { addTopic, TopicNameError, updateProtection } from '@/protection/topics';

interface AddTopicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new topic once it is protected. */
  onAdded?: (topic: ProtectedTopic) => void;
  /** The button that opens the dialog. */
  children: ReactNode;
}

/** Adds a Protected Topic by name; it protects straight away. */
export function AddTopicDialog({ open, onOpenChange, onAdded, children }: AddTopicDialogProps) {
  const inputId = useId();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    let added: ProtectedTopic;
    try {
      const next = await updateProtection((state) => addTopic(state, name));
      added = next.topics.find((topic) => normalize(topic.name) === normalize(name))!;
    } catch (failure) {
      if (failure instanceof TopicNameError) return setError(failure.message);
      throw failure;
    }
    onAdded?.(added);
    setName('');
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add a Protected Topic</DialogTitle>
            <DialogDescription>
              Just its name, such as a game, film, series or book. Blackout hides anything that
              names it straight away.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={inputId}>Name</Label>
            <Input
              id={inputId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Severance"
              autoFocus
              autoComplete="off"
              aria-invalid={error !== null}
              aria-describedby={error ? `${inputId}-error` : undefined}
            />
            {error && (
              <p id={`${inputId}-error`} className="text-destructive text-sm">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit">Protect it</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
