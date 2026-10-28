import { CircleAlert, CircleCheck, Lock } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  connectModel,
  disconnectModel,
  hasModelAccess,
  MODEL_PRESETS,
  presetFor,
  type ConnectionResult,
  type ModelPreset,
} from '@/model/connection';
import type { ModelConnection } from '@/protection/state';

/** The AI model settings: one OpenAI-compatible form, filled in by a preset. */
export function ModelSettings({ connection }: { connection: ModelConnection | null }) {
  const [preset, setPreset] = useState<ModelPreset>(() => (connection ? presetFor(connection) : MODEL_PRESETS[0]!));
  const [form, setForm] = useState<ModelConnection>(
    () => connection ?? { baseUrl: MODEL_PRESETS[0]!.baseUrl, apiKey: '', model: MODEL_PRESETS[0]!.model },
  );
  const [result, setResult] = useState<ConnectionResult | 'testing' | null>(null);
  const ids = { baseUrl: useId(), apiKey: useId(), model: useId() };
  const isStored =
    connection !== null &&
    connection.baseUrl === form.baseUrl &&
    connection.apiKey === form.apiKey &&
    connection.model === form.model;
  /** Whether Blackout can still reach the stored model's server; null until checked. */
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  useEffect(() => {
    if (connection) hasModelAccess(connection).then(setHasAccess);
  }, [connection]);

  const choose = (next: ModelPreset) => {
    if (next === preset) return;
    setPreset(next);
    // Keys belong to one provider, so a new one starts without.
    setForm({ baseUrl: next.baseUrl, apiKey: '', model: next.model });
    setResult(null);
  };
  const edit = (field: keyof ModelConnection, value: string) => {
    setForm({ ...form, [field]: value });
    setResult(null);
  };
  const test = async (event: FormEvent) => {
    event.preventDefault();
    setResult('testing');
    try {
      setResult(await connectModel(form));
    } catch (failure) {
      setResult({ ok: false, message: `Something went wrong: ${String(failure)}` });
    }
  };

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl leading-tight font-semibold tracking-tight">AI model</h1>
        <p className="text-muted-foreground leading-normal">
          Used only to build Related Terms. Optional: without it, Blackout uses topic names and
          your own terms.
        </p>
      </div>

      <form onSubmit={test} className="bg-card flex flex-col gap-5 rounded-2xl border p-6">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-medium">Provider</legend>
          <div className="grid grid-cols-3 gap-2">
            {MODEL_PRESETS.map((option) => {
              const pressed = option === preset;
              return (
                <Button
                  key={option.name}
                  type="button"
                  variant={pressed ? 'default' : 'outline'}
                  aria-pressed={pressed}
                  onClick={() => choose(option)}
                >
                  {option.name}
                  {option.local && (
                    <span
                      className={cn(
                        'rounded border px-1.5 text-[11px] font-medium',
                        pressed ? 'border-primary-foreground/40 text-primary-foreground/70' : 'text-muted-foreground',
                      )}
                    >
                      local
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        </fieldset>

        <div className="bg-border h-px" />

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.baseUrl}>Server address</Label>
            <Input
              id={ids.baseUrl}
              type="url"
              value={form.baseUrl}
              onChange={(event) => edit('baseUrl', event.target.value)}
              placeholder="https://"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.apiKey}>API key</Label>
            <Input
              id={ids.apiKey}
              type="password"
              value={form.apiKey}
              onChange={(event) => edit('apiKey', event.target.value)}
              placeholder={preset.local ? 'Not needed for a local model' : undefined}
              autoComplete="off"
              aria-describedby={`${ids.apiKey}-hint`}
            />
            <p id={`${ids.apiKey}-hint`} className="text-muted-foreground text-[13px]">
              Stays in this browser and is never synced.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={ids.model}>Model name</Label>
            <Input
              id={ids.model}
              value={form.model}
              onChange={(event) => edit('model', event.target.value)}
              placeholder={preset.modelPlaceholder}
              autoComplete="off"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={result === 'testing'}>
            Test connection
          </Button>
          <ConnectionStatus
            result={result}
            stored={isStored ? (hasAccess === false ? 'no-access' : 'connected') : null}
            host={connection ? new URL(connection.baseUrl).host : ''}
          />
          {connection && result !== 'testing' && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={async () => {
                await disconnectModel();
                setResult(null);
              }}
            >
              Disconnect
            </Button>
          )}
        </div>
      </form>

      <div role="note" className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border px-3.5 py-3">
        <Lock className="mt-0.5 size-4" aria-hidden />
        <span className="font-medium">The model never sees what you browse</span>
        <span />
        <span className="text-muted-foreground leading-normal">
          It only receives topic names and the wiki and Reddit text Blackout collects for them.
        </span>
      </div>

      <OllamaSetup key={preset.name} expanded={preset.name === 'Ollama'} />
    </>
  );
}

interface ConnectionStatusProps {
  result: ConnectionResult | 'testing' | null;
  /** How the stored connection stands when it is what the form shows. */
  stored: 'connected' | 'no-access' | null;
  host: string;
}

function ConnectionStatus({ result, stored, host }: ConnectionStatusProps) {
  if (result === 'testing') {
    return (
      <span role="status" className="text-muted-foreground text-[13px]">
        Testing…
      </span>
    );
  }
  if (result?.ok === false) {
    return (
      // On its own line under the buttons, since it can run long.
      <span role="status" className="text-destructive order-last inline-flex basis-full items-start gap-1.5 text-[13px]">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {result.message}
      </span>
    );
  }
  if (!result && stored === 'no-access') {
    return (
      <span role="status" className="text-destructive order-last inline-flex basis-full items-start gap-1.5 text-[13px]">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        Blackout can no longer reach {host}. Press Test connection to allow it again.
      </span>
    );
  }
  if (result?.ok || stored === 'connected') {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-[13px]">
        <CircleCheck className="size-4 text-green-400" aria-hidden />
        {result?.ok ? `Connected · replied in ${(result.replyMs / 1000).toFixed(1)} s` : 'Connected'}
      </span>
    );
  }
  return null;
}

/** How to let a browser extension reach Ollama, which blocks extensions by default. */
function OllamaSetup({ expanded }: { expanded: boolean }) {
  const [open, setOpen] = useState(expanded);
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border px-3.5 py-3">
      <span className="font-medium">Using Ollama?</span>
      <span className="text-muted-foreground leading-normal">
        Ollama blocks browser extensions until you allow them. Set OLLAMA_ORIGINS to include
        chrome-extension://* and restart Ollama.
      </span>
      {open ? (
        <>
          <ul className="text-muted-foreground mt-1 flex list-disc flex-col gap-2 pl-5 leading-normal">
            <li>
              <span className="text-foreground font-medium">Windows:</span> quit Ollama from the
              taskbar. Search the Start menu for “environment variables”, open “Edit environment
              variables for your account” and add a new variable named{' '}
              <code className="text-foreground">OLLAMA_ORIGINS</code> with the value{' '}
              <code className="text-foreground">chrome-extension://*</code>. Start Ollama again.
            </li>
            <li>
              <span className="text-foreground font-medium">macOS:</span> in Terminal, run{' '}
              <code className="text-foreground">launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"</code>,
              then quit and reopen Ollama.
            </li>
            <li>
              <span className="text-foreground font-medium">Linux:</span> run{' '}
              <code className="text-foreground">sudo systemctl edit ollama.service</code>, add{' '}
              <code className="text-foreground">Environment="OLLAMA_ORIGINS=chrome-extension://*"</code>{' '}
              under <code className="text-foreground">[Service]</code>, then run{' '}
              <code className="text-foreground">sudo systemctl daemon-reload</code> and{' '}
              <code className="text-foreground">sudo systemctl restart ollama</code>.
            </li>
          </ul>
          <p className="text-muted-foreground leading-normal">Then come back here and press Test connection.</p>
        </>
      ) : (
        <button
          type="button"
          className="self-start font-medium underline underline-offset-4"
          onClick={() => setOpen(true)}
        >
          Show step-by-step instructions
        </button>
      )}
    </div>
  );
}
