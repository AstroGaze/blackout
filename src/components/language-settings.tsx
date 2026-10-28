import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { languageName } from '@/lib/languages';
import { updateProtection } from '@/protection/topics';

/** Languages offered, by how widely they're used online. */
const LANGUAGES = ['en', 'es', 'pt', 'fr', 'de', 'it', 'ja', 'ko', 'zh', 'ru', 'pl', 'nl', 'tr', 'ar', 'hi', 'id'];

/**
 * The languages the user browses in. Each refresh asks the AI model for terms in
 * all of them; the first is also the language Wikipedia is read in.
 */
export function LanguageSettings({ languages }: { languages: string[] }) {
  const save = (next: string[]) => updateProtection((state) => ({ ...state, browsingLanguages: next }));
  const addable = LANGUAGES.filter((code) => !languages.includes(code));

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl leading-tight font-semibold tracking-tight">Languages</h1>
        <p className="text-muted-foreground leading-normal">
          The languages you browse in. Your AI model lists the names people use for a topic in
          each of them, so posts in any of these languages are caught too.
        </p>
      </div>

      <section className="bg-card flex flex-col gap-4 rounded-2xl border p-6">
        <ul aria-label="Browsing languages" className="flex flex-wrap gap-2">
          {languages.map((code, index) => (
            <li
              key={code}
              className="bg-muted inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium has-[button]:pr-1"
            >
              {languageName(code)}
              {index === 0 && <span className="text-muted-foreground text-xs font-normal">main</span>}
              {languages.length > 1 && (
                <Button
                  variant="ghost"
                  aria-label={`Remove ${languageName(code)}`}
                  className="text-muted-foreground size-[22px] rounded-sm p-0"
                  onClick={() => save(languages.filter((other) => other !== code))}
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={addable.length === 0}>
                <Plus />
                Add language
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {addable.map((code) => (
                <DropdownMenuItem key={code} onSelect={() => save([...languages, code])}>
                  {languageName(code)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="text-muted-foreground text-[13px]">
            The main language is also the one Wikipedia is read in. Changes apply from the next refresh.
          </span>
        </div>
      </section>
    </>
  );
}
