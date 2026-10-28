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

/** How much background material the model gets, in characters. */
const MATERIAL_LIMIT = 12_000;

/** Long prompts on local models can take minutes. */
const MODEL_TIMEOUT_MS = 5 * 60_000;

const WIKIPEDIA_TIMEOUT_MS = 20_000;

/**
 * The longest a refresh can run: two model calls, and two Wikipedia reads of
 * three attempts each with the waits between them. One that began longer ago
 * than this never finished.
 */
const REFRESH_LIMIT_MS = 2 * MODEL_TIMEOUT_MS + 2 * (3 * WIKIPEDIA_TIMEOUT_MS + 2 * 60_000) + 60_000;

/** Why building terms failed, worded for the settings page. */
class RefreshError extends Error {}

/** Topics this service worker is refreshing right now. */
const running = new Set<string>();

/** Whether the topic's Related Terms are being built right now. */
export function isRefreshing(topic: ProtectedTopic, now = Date.now()): boolean {
  return typeof topic.refreshingSince === 'number' && now - topic.refreshingSince < REFRESH_LIMIT_MS;
}

/**
 * Asks the model for the topic's Related Terms and adds the new ones to its
 * list. Without a model connected it does nothing: the topic keeps working on
 * its name and the user's own terms. A failure keeps the existing list and is
 * recorded on the topic.
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
    const language = state.browsingLanguages[0] ?? 'en';
    const material = await wikipediaArticle(topic.name, language);
    const found = await askForTerms(connection, topic.name, material, language);
    await updateProtection((current) =>
      changeTopic(current, topicId, (changed) => {
        const added = newTerms(changed, found, language);
        return {
          ...changed,
          terms: [...changed.terms, ...added],
          lastRefresh: { at: Date.now(), ok: true, added: added.length, sourcesRead: material ? ['Wikipedia'] : [] },
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

/** Media types Wikipedia puts in brackets after a title, as in "Severance (TV series)". */
const MEDIA_QUALIFIER =
  /\s*\((?:\d{4} )?(?:[\w-]+ )?(?:video game|game|film|movie|TV series|television series|miniseries|series|novel|book|anime|manga|comics?|web series)\)$/i;

/** Any bracketed qualifier after a Wikipedia title. */
const QUALIFIER = /\s*\(.*\)$/;

/**
 * The plain text of the topic's Wikipedia article, trimmed to fit the model, or
 * null when Wikipedia can't be read. Of the search results, the article about a
 * piece of media wins over a page that only shares its name.
 */
async function wikipediaArticle(name: string, language: string): Promise<string | null> {
  // Wikipedia's sites go by language alone: "pt", not "pt-BR".
  const api = `https://${language.split('-')[0]!.toLowerCase()}.wikipedia.org/w/api.php`;
  const search = await readJson<{ query?: { search?: { title: string }[] } }>(
    `${api}?${new URLSearchParams({ action: 'query', list: 'search', srsearch: name, srlimit: '5', srprop: '', format: 'json', formatversion: '2' })}`,
  );
  const titles = search?.query?.search?.map((result) => result.title) ?? [];
  const sharesTopicName = (title: string) => sameTerm(title.replace(QUALIFIER, ''), name);
  const title =
    titles.find((candidate) => sharesTopicName(candidate) && MEDIA_QUALIFIER.test(candidate)) ??
    titles.find(sharesTopicName) ??
    titles[0];
  if (!title) return null;

  const article = await readJson<{ query?: { pages?: { extract?: string }[] } }>(
    `${api}?${new URLSearchParams({ action: 'query', prop: 'extracts', explaintext: '1', exsectionformat: 'plain', titles: title, redirects: '1', format: 'json', formatversion: '2' })}`,
  );
  const text = article?.query?.pages?.[0]?.extract?.trim();
  return text ? text.slice(0, MATERIAL_LIMIT) : null;
}

/** Wikimedia asks browser clients to name themselves in this header. */
const API_USER_AGENT = 'Blackout/0.1 (spoiler-blocking browser extension)';

/** Wikipedia is asked at most this many times for each thing Blackout reads. */
const WIKIPEDIA_ATTEMPTS = 3;

/** Waiting longer than this for Wikipedia would hold up the refresh too long. */
const LONGEST_WAIT_MS = 60_000;

/**
 * Fetches JSON from Wikipedia, or null when it can't be read. When Wikipedia is
 * busy or limiting requests, it waits as long as Wikipedia asks, or else 5 and
 * then 10 seconds, as Wikimedia's rate-limit rules ask clients to.
 */
async function readJson<T>(url: string): Promise<T | null> {
  for (let attempt = 1; ; attempt++) {
    let wait: number;
    try {
      const response = await fetch(url, {
        headers: { 'Api-User-Agent': API_USER_AGENT },
        signal: AbortSignal.timeout(WIKIPEDIA_TIMEOUT_MS),
      });
      if (response.ok) return (await response.json()) as T;
      // Only a busy or rate-limited Wikipedia is worth asking again.
      if (response.status !== 429 && response.status < 500) return null;
      wait = retryAfterMs(response.headers.get('Retry-After')) ?? 5_000 * 2 ** (attempt - 1);
    } catch {
      wait = 5_000 * 2 ** (attempt - 1);
    }
    if (attempt === WIKIPEDIA_ATTEMPTS || wait > LONGEST_WAIT_MS) return null;
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

/** A Retry-After header, in seconds or as a date, as milliseconds to wait. */
function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

interface FoundTerm {
  text: string;
  level: SpoilerLevel;
  strength: TermStrength;
}

/** What the model is asked to do, as its system message. */
function instructions(languageName: string): string {
  return [
    'You build term lists for a spoiler blocker. Given a piece of media and background text about it, list the words and phrases that show a post or video is about it: other names, abbreviations and hashtags, characters, places, factions, organisations, events and notable objects.',
    'For each term give:',
    '- "level": "common" if the title, trailers, marketing or premise already reveal it; "minor" for side characters, factions and places that weren’t in the marketing; "major" for characters and events from late in the story, deaths, twists and endings, or whenever you aren’t sure.',
    '- "strength": "strong" if the term points to this media on its own; "weak" if it is also an everyday word or a common name, such as "Mark" or "Jason".',
    `Write the terms in ${languageName}. Reply with JSON only, in this shape: {"terms":[{"text":"…","level":"common","strength":"strong"}]}`,
  ].join('\n');
}

/** Asks the model for terms, once more if its reply can't be read as a term list. */
async function askForTerms(
  connection: ModelConnection,
  name: string,
  material: string | null,
  language: string,
): Promise<FoundTerm[]> {
  const languageName = new Intl.DisplayNames(['en'], { type: 'language' }).of(language) ?? language;
  const messages: ChatMessage[] = [
    { role: 'system', content: instructions(languageName) },
    { role: 'user', content: `Media: ${name}\n\nBackground:\n${material ?? '(none found)'}` },
  ];
  const reply = await chatCompletion(connection, messages, { timeoutMs: MODEL_TIMEOUT_MS });
  const terms = parseTerms(reply);
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
  const retried = parseTerms(retry);
  if (retried) return retried;
  throw new RefreshError('The AI model’s reply couldn’t be read as a term list, twice. The existing terms are kept.');
}

/**
 * Reads the model's reply as a term list, or null when it holds no usable term.
 * A missing or unknown Spoiler Level counts as Major and a missing strength as
 * Strong, so a sloppy reply never weakens protection. A term too short to point
 * to the topic is dropped, and a single everyday word is kept as Weak.
 */
function parseTerms(reply: string): FoundTerm[] | null {
  // Reasoning models may think out loud first; the answer may sit in a code fence.
  const answer = reply.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(answer)?.[1] ?? answer;
  const start = fenced.search(/[[{]/);
  const end = Math.max(fenced.lastIndexOf('}'), fenced.lastIndexOf(']'));
  if (start === -1 || end < start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
  const list = Array.isArray(parsed) ? parsed : (parsed as { terms?: unknown } | null)?.terms;
  if (!Array.isArray(list)) return null;
  const terms = list.flatMap((item: { text?: unknown; level?: unknown; strength?: unknown } | null) => {
    const text = typeof item?.text === 'string' ? item.text.trim() : '';
    if (isTooShort(text)) return [];
    const level = SPOILER_LEVELS.find((known) => known === lowercase(item?.level)) ?? 'major';
    const everyday = broadWordKind(text) === 'everyday';
    const strength: TermStrength = lowercase(item?.strength) === 'weak' || everyday ? 'weak' : 'strong';
    return [{ text, level, strength }];
  });
  return terms.length > 0 ? terms : null;
}

/** A single word of two characters or fewer, or a bare number, matches far too much to keep. */
function isTooShort(text: string): boolean {
  const words = normalize(text).split(' ').filter(Boolean);
  return words.length === 0 || (words.length === 1 && (words[0]!.length <= 2 || /^\d+$/.test(words[0]!)));
}

function lowercase(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

/**
 * The found terms the topic doesn't have yet, compared as the matcher reads them.
 * Only the topic's name and AI-added terms count: the user's own terms are kept
 * apart, so removing one never removes the AI's copy.
 */
function newTerms(topic: ProtectedTopic, found: FoundTerm[], language: string): RelatedTerm[] {
  const known = [topic.name, ...topic.terms.filter((term) => term.addedBy === 'ai').map((term) => term.text)];
  const added: RelatedTerm[] = [];
  for (const term of found) {
    if (known.some((text) => sameTerm(text, term.text))) continue;
    known.push(term.text);
    added.push({ ...term, language, addedBy: 'ai' });
  }
  return added;
}
