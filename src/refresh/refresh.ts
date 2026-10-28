// Builds a topic's Related Terms with the user's AI model, in the background.
// The model receives only the topic's name and the material collected for it
// here, never anything from the pages the user browses (ADR-0002).

import { browser } from 'wxt/browser';
import { normalize } from '@/matcher/matcher';
import { chatCompletion, ConnectionError, hasModelAccess, type ChatMessage } from '@/model/connection';
import {
  protectionState,
  type ModelConnection,
  type ProtectedTopic,
  type RelatedTerm,
  type SpoilerLevel,
  type TermStrength,
} from '@/protection/state';
import { broadWordKind, changeTopic, sameTerm, SPOILER_LEVELS, updateProtection } from '@/protection/topics';
import { languageName } from '@/lib/languages';
import {
  combineMaterial,
  fandomMaterial,
  fandomWikiExists,
  LONGEST_READ_MS,
  parseWikiAddress,
  wikipediaArticle,
  type SourceText,
} from './sources';

/** How much background material the model gets, in characters. */
const MATERIAL_LIMIT = 16_000;

/** Long prompts on local models can take minutes. */
const MODEL_TIMEOUT_MS = 5 * 60_000;

/**
 * The longest a refresh can run: three model calls (sources, terms and one
 * retry) and seven reads from Wikipedia and Fandom. One that began longer ago
 * than this never finished.
 */
const REFRESH_LIMIT_MS = 3 * MODEL_TIMEOUT_MS + 7 * LONGEST_READ_MS;

/** Why building terms failed, worded for the settings page. */
class RefreshError extends Error {}

/** Topics this service worker is refreshing right now. */
const running = new Set<string>();

/** Whether the topic's Related Terms are being built right now. */
export function isRefreshing(topic: ProtectedTopic, now = Date.now()): boolean {
  return typeof topic.refreshingSince === 'number' && now - topic.refreshingSince < REFRESH_LIMIT_MS;
}

/**
 * Reads the topic's sources, asks the model for its Related Terms and adds the
 * new ones to its list. Without a model connected it does nothing: the topic
 * keeps working on its name and the user's own terms. A failure keeps the
 * existing list and is recorded on the topic.
 */
export async function refreshTopic(topicId: string): Promise<void> {
  if (running.has(topicId)) return;
  running.add(topicId);
  try {
    await refreshUnlessRunning(topicId);
  } finally {
    running.delete(topicId);
  }
}

async function refreshUnlessRunning(topicId: string): Promise<void> {
  const state = await protectionState.getValue();
  const topic = state.topics.find((candidate) => candidate.id === topicId);
  const connection = state.modelConnection;
  // Another context may be building this topic's terms already.
  if (!topic || !connection || isRefreshing(topic)) return;

  await updateProtection((current) =>
    changeTopic(current, topicId, (changed) => ({ ...changed, refreshingSince: Date.now() })),
  );
  const stopKeepingAlive = keepServiceWorkerAlive();
  try {
    if (!(await hasModelAccess(connection))) {
      const { host } = new URL(connection.baseUrl);
      throw new RefreshError(`Blackout can no longer reach ${host}. Test the connection again in AI model settings.`);
    }
    const languages = state.browsingLanguages.length > 0 ? state.browsingLanguages : ['en'];
    const suggested = isNew(topic) ? await keepSuggestedSources(topic, connection, languages[0]!) : undefined;
    // Without the model's suggestion, the sources stay unsettled so it is asked again next time.
    const settled = suggested !== null;
    const sources = suggested ?? topic.sources;

    const fandom = sources.wiki ? await fandomMaterial(sources.wiki, topic.name) : null;
    const wikipedia = await wikipediaArticle(topic.name, languages[0]!, sources.wikipedia);
    const read: SourceText[] = [
      ...(fandom ? [{ source: 'Fandom' as const, text: fandom.text }] : []),
      ...(wikipedia ? [{ source: 'Wikipedia' as const, text: wikipedia.text }] : []),
    ];
    const found = await askForTerms(connection, topic.name, combineMaterial(read, MATERIAL_LIMIT), languages);

    await updateProtection((current) =>
      changeTopic(current, topicId, (changed) => {
        const added = newTerms(changed, found);
        return {
          ...changed,
          sources: {
            ...changed.sources,
            // A source the user changed while this ran wins over what this refresh read.
            wiki: changed.sources.wiki !== sources.wiki ? changed.sources.wiki : (fandom?.pageUrl ?? sources.wiki),
            wikipedia:
              changed.sources.wikipedia !== sources.wikipedia || !settled
                ? changed.sources.wikipedia
                : (wikipedia?.title ?? sources.wikipedia ?? null),
          },
          terms: [...changed.terms, ...added],
          lastRefresh: { at: Date.now(), ok: true, added: added.length, sourcesRead: read.map((part) => part.source) },
          refreshingSince: undefined,
        };
      }),
    );
  } catch (failure) {
    let error: string;
    if (failure instanceof RefreshError || failure instanceof ConnectionError) {
      error = failure.message;
    } else {
      console.error('Building Related Terms failed', failure);
      error = 'Something unexpected went wrong. The existing terms are kept.';
    }
    await updateProtection((current) =>
      changeTopic(current, topicId, (changed) => ({
        ...changed,
        lastRefresh: { at: Date.now(), ok: false, error },
        refreshingSince: undefined,
      })),
    );
  } finally {
    stopKeepingAlive();
  }
}

/** A topic whose sources haven't been looked for yet. */
function isNew(topic: ProtectedTopic): boolean {
  return topic.sources.wiki === null && topic.sources.wikipedia === undefined;
}

/**
 * Asks the model for the topic's sources and stores them straight away, so a
 * refresh that fails later keeps them. Null when the model can't answer.
 */
async function keepSuggestedSources(
  topic: ProtectedTopic,
  connection: ModelConnection,
  language: string,
): Promise<ProtectedTopic['sources'] | null> {
  const suggested = await suggestSources(connection, topic.name, language);
  if (!suggested) return null;
  const next = await updateProtection((state) =>
    changeTopic(state, topic.id, (changed) => ({
      ...changed,
      sources: {
        ...changed.sources,
        wiki: changed.sources.wiki ?? suggested.wiki,
        wikipedia: changed.sources.wikipedia !== undefined ? changed.sources.wikipedia : suggested.wikipedia,
      },
    })),
  );
  return next.topics.find((stored) => stored.id === topic.id)?.sources ?? topic.sources;
}

/**
 * Builds Related Terms for each topic the user adds while a model is connected.
 * Returns a function that stops watching.
 */
export function watchForNewTopics(): () => void {
  return protectionState.watch((next, previous) => {
    // The first state, written at install, adds no topic of the user's.
    if (!previous || !next?.modelConnection) return;
    const known = new Set(previous.topics.map((topic) => topic.id));
    for (const topic of next.topics) {
      if (!known.has(topic.id)) void refreshTopic(topic.id);
    }
  });
}

/**
 * Keeps the background service worker running while it waits on slow network
 * replies: calling an extension API resets the browser's idle timer.
 */
function keepServiceWorkerAlive(): () => void {
  const timer = setInterval(() => void browser.runtime.getPlatformInfo().catch(() => {}), 20_000);
  return () => clearInterval(timer);
}

/**
 * Asks the model where the topic is described: its Fandom wiki and its
 * Wikipedia article. Keeps only a wiki that exists. Null when the model can't
 * answer or its reply can't be read.
 */
async function suggestSources(
  connection: ModelConnection,
  name: string,
  language: string,
): Promise<{ wiki: string | null; wikipedia: string | null } | null> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You find where a piece of media is described online. Reply with JSON only, in this shape: {"fandom":"its Fandom wiki's address, such as gta.fandom.com, or null","wikipedia":"the exact title of its article on ${languageName(language)} Wikipedia, or null"}. Use null when you aren't sure it exists.`,
    },
    { role: 'user', content: `Media: ${name}` },
  ];
  let reply: string;
  try {
    reply = await chatCompletion(connection, messages, { timeoutMs: MODEL_TIMEOUT_MS });
  } catch {
    return null;
  }
  const parsed = jsonInReply(reply);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const { fandom, wikipedia } = parsed as { fandom?: unknown; wikipedia?: unknown };
  const wiki = typeof fandom === 'string' ? parseWikiAddress(fandom) : null;
  const wikiExists = wiki !== null && (await fandomWikiExists(new URL(wiki.base).hostname));
  return {
    wiki: wiki && wikiExists ? `${wiki.base}/` : null,
    wikipedia: typeof wikipedia === 'string' && wikipedia.trim() !== '' ? wikipedia.trim().slice(0, 200) : null,
  };
}

interface FoundTerm {
  text: string;
  level: SpoilerLevel;
  strength: TermStrength;
  language: string;
}

/** What the model is asked to do, as its system message. */
function instructions(languages: string[]): string {
  const named = languages.map((code) => `${languageName(code)} (${code})`).join(', ');
  return [
    'You build term lists for a spoiler blocker. Given a piece of media and background text about it, list the words and phrases that show a post or video is about it: other names, abbreviations and hashtags, characters, places, factions, organisations, events and notable objects.',
    'For each term give:',
    '- "level": "common" if the title, trailers, marketing or premise already reveal it; "minor" for side characters, factions and places that weren’t in the marketing; "major" for characters and events from late in the story, deaths, twists and endings, or whenever you aren’t sure.',
    '- "strength": "strong" if the term points to this media on its own; "weak" if it is also an everyday word or a common name, such as "Mark" or "Jason".',
    `- "language": the code of the language it is written in. List the terms people use in each of these languages: ${named}. Leave out translations nobody uses.`,
    'Reply with JSON only, in this shape: {"terms":[{"text":"…","level":"common","strength":"strong","language":"en"}]}',
  ].join('\n');
}

/** Asks the model for terms, once more if its reply can't be read as a term list. */
async function askForTerms(
  connection: ModelConnection,
  name: string,
  material: string | null,
  languages: string[],
): Promise<FoundTerm[]> {
  const messages: ChatMessage[] = [
    { role: 'system', content: instructions(languages) },
    { role: 'user', content: `Media: ${name}\n\nBackground:\n${material ?? '(none found)'}` },
  ];
  const reply = await chatCompletion(connection, messages, { timeoutMs: MODEL_TIMEOUT_MS });
  const terms = parseTerms(reply, languages);
  if (terms) return terms;

  const retry = await chatCompletion(
    connection,
    [
      ...messages,
      { role: 'assistant', content: reply },
      { role: 'user', content: 'That wasn’t the JSON asked for. Reply with the JSON term list only.' },
    ],
    { timeoutMs: MODEL_TIMEOUT_MS },
  );
  const retried = parseTerms(retry, languages);
  if (retried) return retried;
  throw new RefreshError('The AI model’s reply couldn’t be read as a term list, twice. The existing terms are kept.');
}

/**
 * The JSON value in a model's reply, or null. Reasoning models may think out
 * loud first, and the answer may sit in a code fence.
 */
function jsonInReply(reply: string): unknown {
  const answer = reply.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(answer)?.[1] ?? answer;
  const start = fenced.search(/[[{]/);
  const end = Math.max(fenced.lastIndexOf('}'), fenced.lastIndexOf(']'));
  if (start === -1 || end < start) return null;
  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Reads the model's reply as a term list, or null when it holds no usable term.
 * A missing or unknown Spoiler Level counts as Major and a missing strength as
 * Strong, so a sloppy reply never weakens protection. A term too short to point
 * to the topic is dropped, and a single everyday word is kept as Weak. A term
 * keeps the language the model gives, and without a valid one counts as the
 * main browsing language.
 */
function parseTerms(reply: string, languages: string[]): FoundTerm[] | null {
  const parsed = jsonInReply(reply);
  const list = Array.isArray(parsed) ? parsed : (parsed as { terms?: unknown } | null)?.terms;
  if (!Array.isArray(list)) return null;
  const terms = list.flatMap(
    (item: { text?: unknown; level?: unknown; strength?: unknown; language?: unknown } | null) => {
      const text = typeof item?.text === 'string' ? item.text.trim() : '';
      if (isTooShort(text)) return [];
      const level = SPOILER_LEVELS.find((known) => known === lowercase(item?.level)) ?? 'major';
      const everyday = broadWordKind(text) === 'everyday';
      const strength: TermStrength = lowercase(item?.strength) === 'weak' || everyday ? 'weak' : 'strong';
      const language = languageOf(item?.language, languages);
      return [{ text, level, strength, language }];
    },
  );
  return terms.length > 0 ? terms : null;
}

/** A single word of two characters or fewer, or a bare number, matches far too much to keep. */
function isTooShort(text: string): boolean {
  const words = normalize(text).split(' ').filter(Boolean);
  return words.length === 0 || (words.length === 1 && (words[0]!.length <= 2 || /^\d+$/.test(words[0]!)));
}

/** The model's language code for a term, written as the browsing languages write it, or the main one. */
function languageOf(given: unknown, languages: string[]): string {
  if (typeof given !== 'string' || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(given.trim())) return languages[0]!;
  const code = given.trim();
  return languages.find((known) => known.toLowerCase() === code.toLowerCase()) ?? code.toLowerCase();
}

function lowercase(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

/**
 * The found terms the topic doesn't have yet, compared as the matcher reads them.
 * Only the topic's name and AI-added terms count: the user's own terms are kept
 * apart, so removing one never removes the AI's copy.
 */
function newTerms(topic: ProtectedTopic, found: FoundTerm[]): RelatedTerm[] {
  const known = [topic.name, ...topic.terms.filter((term) => term.addedBy === 'ai').map((term) => term.text)];
  const added: RelatedTerm[] = [];
  for (const term of found) {
    if (known.some((text) => sameTerm(text, term.text))) continue;
    known.push(term.text);
    added.push({ ...term, addedBy: 'ai' });
  }
  return added;
}
