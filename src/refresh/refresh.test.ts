// The refresh seam: recorded network responses in, the stored term list out.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { protectionState, type ModelConnection, type RelatedTerm } from '@/protection/state';
import { addTopic, addUserTerm, changeTopic, updateProtection } from '@/protection/topics';
import { stateWithTopics, topic } from '@/test/state';
import fandomNewPages from './fixtures/fandom-new-pages-severance.json';
import fandomPage from './fixtures/fandom-page-severance.json';
import fandomSearch from './fixtures/fandom-search-severance.json';
import fandomSiteinfo from './fixtures/fandom-siteinfo-severance.json';
import wikipediaExtract from './fixtures/wikipedia-extract-severance.json';
import wikipediaSearch from './fixtures/wikipedia-search-severance.json';
import { refreshTopic, watchForNewTopics } from './refresh';

const deepseek: ModelConnection = { baseUrl: 'https://api.deepseek.com', apiKey: 'sk-test', model: 'deepseek-chat' };

/** A chat completion as DeepSeek returns it, with the reply text wrapped in a code fence. */
function deepseekReply(content: string): Response {
  return Response.json({
    id: 'a1b2c3d4-0000-4000-8000-000000000000',
    object: 'chat.completion',
    created: 1793150000,
    model: 'deepseek-chat',
    choices: [{ index: 0, message: { role: 'assistant', content }, logprobs: null, finish_reason: 'stop' }],
    usage: { prompt_tokens: 7012, completion_tokens: 412, total_tokens: 7424 },
    system_fingerprint: 'fp_test',
  });
}

const fenced = (value: unknown) => '```json\n' + JSON.stringify(value, null, 2) + '\n```';

const WELL_FORMED = fenced({
  terms: [
    { text: 'Lumon Industries', level: 'common', strength: 'strong' },
    { text: 'Mark Scout', level: 'common', strength: 'strong' },
    { text: 'Helly', level: 'common', strength: 'weak' },
    { text: 'Ms. Casey', level: 'minor', strength: 'strong' },
    { text: 'Cold Harbor', level: 'major', strength: 'strong' },
    // The topic's own name, which already protects on its own.
    { text: '#Severance', level: 'common', strength: 'strong' },
  ],
});

/** Another article from the search results, such as "Severance package". */
function otherArticle(title: string) {
  return {
    batchcomplete: true,
    query: { pages: [{ pageid: 1, ns: 0, title, extract: `${title} is not about the series. Payment owed to employees.` }] },
  };
}

/** The model's suggestion of where to read about Severance. */
const suggests = (sources: { fandom: string | null; wikipedia: string | null }) => deepseekReply(fenced(sources));

/** The Severance Fandom wiki, from the recorded responses. */
function severanceWiki(url: URL, pageText?: string): Response {
  if (url.searchParams.get('meta') === 'siteinfo') return Response.json(fandomSiteinfo);
  if (url.searchParams.get('list') === 'search') return Response.json(fandomSearch);
  if (url.searchParams.get('list') === 'recentchanges') return Response.json(fandomNewPages);
  if (url.searchParams.get('action') === 'parse') {
    return Response.json(pageText ? { parse: { ...fandomPage.parse, wikitext: pageText } } : fandomPage);
  }
  return new Response('Not found', { status: 404 });
}

const isTermRequest = (body: { messages: { role: string; content: string }[] }) =>
  body.messages[0]?.content.startsWith('You build term lists') ?? false;

/**
 * Replaces the network:
 * - Wikipedia answers with `wikipediaFirst` in order, then from the recorded
 *   responses (or always with `wikipedia`).
 * - severance-tv.fandom.com answers from its recorded responses (or always with
 *   `fandom`); any other Fandom wiki doesn't exist.
 * - The model server answers a request for sources with `suggestion`, and
 *   requests for terms with `modelReplies` in order.
 */
function network({
  wikipedia,
  wikipediaFirst = [],
  fandom,
  fandomPageText,
  beforeTerms,
  suggestion = suggests({ fandom: 'severance-tv.fandom.com', wikipedia: null }),
  modelReplies,
}: {
  wikipedia?: Response;
  wikipediaFirst?: Response[];
  fandom?: Response;
  /** Replaces the text of the wiki's Severance page. */
  fandomPageText?: string;
  /** Runs when the model is asked for terms, before it answers. */
  beforeTerms?: () => Promise<unknown>;
  suggestion?: Response;
  modelReplies: Response[];
}) {
  const fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname.endsWith('.fandom.com')) {
      if (fandom) return fandom.clone();
      return url.hostname === 'severance-tv.fandom.com' ? severanceWiki(url, fandomPageText) : new Response('Not a wiki', { status: 404 });
    }
    if (url.hostname.endsWith('.wikipedia.org')) {
      const next = wikipediaFirst.shift();
      if (next) return next;
      if (wikipedia) return wikipedia.clone();
      if (url.searchParams.get('list') === 'search') return Response.json(wikipediaSearch);
      if (url.searchParams.get('titles') === 'Severance (season 9)') {
        return Response.json({ query: { pages: [{ ns: 0, title: 'Severance (season 9)', missing: true }] } });
      }
      return url.searchParams.get('titles') === 'Severance (TV series)'
        ? Response.json(wikipediaExtract)
        : Response.json(otherArticle(url.searchParams.get('titles') ?? ''));
    }
    if (url.hostname === 'api.deepseek.com') {
      if (!isTermRequest(JSON.parse(String(init?.body)))) return suggestion.clone();
      await beforeTerms?.();
      return modelReplies.shift() ?? new Response('No more replies', { status: 500 });
    }
    throw new TypeError(`Unexpected request to ${url}`);
  });
  vi.stubGlobal('fetch', fetch);
  const wikipediaRequests = () =>
    fetch.mock.calls.filter(([input]) => new URL(String(input)).hostname.endsWith('.wikipedia.org')).length;
  const allModelRequests = () =>
    fetch.mock.calls
      .filter(([input]) => new URL(String(input)).hostname === 'api.deepseek.com')
      .map(([, init]) => JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] });
  /** Requests for terms, leaving out the request for sources. */
  const modelRequests = () => allModelRequests().filter(isTermRequest);
  const suggestionRequests = () => allModelRequests().filter((body) => !isTermRequest(body));
  return { fetch, modelRequests, suggestionRequests, wikipediaRequests };
}

/** A state with Severance protected by name, and a model connected unless `model` is null. */
async function severanceProtected({ model = deepseek }: { model?: ModelConnection | null } = {}) {
  await protectionState.setValue({ ...addTopic(stateWithTopics(), 'Severance'), modelConnection: model });
}

const storedTopic = async () => (await protectionState.getValue()).topics.find((t) => t.id === 'severance')!;
const aiTerms = (terms: RelatedTerm[]) => terms.filter((term) => term.addedBy === 'ai');

beforeEach(() => {
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true as never);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Lets the refresh's waits pass, as if minutes went by. */
async function withTimePassing(refreshed: Promise<void>): Promise<void> {
  vi.useFakeTimers();
  await vi.advanceTimersByTimeAsync(5 * 60_000);
  await refreshed;
}

describe('building a topic’s Related Terms', () => {
  it('stores the model’s terms from a well-formed DeepSeek reply, with their levels and strengths', async () => {
    await severanceProtected();
    network({ modelReplies: [deepseekReply(WELL_FORMED)] });

    await refreshTopic('severance');

    const stored = await storedTopic();
    expect(aiTerms(stored.terms)).toEqual([
      { text: 'Lumon Industries', level: 'common', strength: 'strong', language: 'en', addedBy: 'ai' },
      { text: 'Mark Scout', level: 'common', strength: 'strong', language: 'en', addedBy: 'ai' },
      { text: 'Helly', level: 'common', strength: 'weak', language: 'en', addedBy: 'ai' },
      { text: 'Ms. Casey', level: 'minor', strength: 'strong', language: 'en', addedBy: 'ai' },
      { text: 'Cold Harbor', level: 'major', strength: 'strong', language: 'en', addedBy: 'ai' },
    ]);
    expect(stored.lastRefresh).toEqual({ at: expect.any(Number), ok: true, added: 5, sourcesRead: ['Fandom', 'Wikipedia'] });
  });

  it('sends the model only the topic’s name and the material read about it', async () => {
    await severanceProtected();
    await updateProtection((state) => addUserTerm(state, 'severance', 'my own secret term'));
    const { fetch, modelRequests } = network({ modelReplies: [deepseekReply(WELL_FORMED)] });

    await refreshTopic('severance');

    const sent = JSON.stringify(modelRequests());
    expect(sent).toContain('Severance');
    expect(sent).toContain('Lumon Industries');
    expect(sent).not.toContain('my own secret term');
    const hosts = new Set(fetch.mock.calls.map(([input]) => new URL(String(input)).hostname));
    expect(hosts).toEqual(new Set(['en.wikipedia.org', 'severance-tv.fandom.com', 'api.deepseek.com']));
  });

  it('tells Wikipedia who is asking, with a link to the project', async () => {
    await severanceProtected();
    const { fetch } = network({ modelReplies: [deepseekReply(WELL_FORMED)] });

    await refreshTopic('severance');

    const wikipediaHeaders = fetch.mock.calls
      .filter(([input]) => new URL(String(input)).hostname.endsWith('.wikipedia.org'))
      .map(([, init]) => new Headers(init?.headers).get('Api-User-Agent'));
    expect(wikipediaHeaders).not.toHaveLength(0);
    for (const header of wikipediaHeaders) expect(header).toContain('https://github.com/AstroGaze/blackout');
  });

  it('gives the model the article about the media, not another page that shares its name', async () => {
    await severanceProtected();
    const { modelRequests } = network({ modelReplies: [deepseekReply(WELL_FORMED)] });

    await refreshTopic('severance');

    const sent = JSON.stringify(modelRequests());
    expect(sent).toContain('Ben Stiller');
    expect(sent).not.toContain('Payment owed to employees');
  });

  it('reads Wikipedia in the browsing language, even when it names a region', async () => {
    await protectionState.setValue({
      ...addTopic(stateWithTopics(), 'Severance'),
      modelConnection: deepseek,
      browsingLanguages: ['pt-BR'],
    });
    const { fetch } = network({ modelReplies: [deepseekReply(WELL_FORMED)] });

    await refreshTopic('severance');

    const hosts = fetch.mock.calls.map(([input]) => new URL(String(input)).hostname);
    expect(hosts).toContain('pt.wikipedia.org');
    expect(aiTerms((await storedTopic()).terms)[0]).toMatchObject({ language: 'pt-BR' });
  });

  it('reads a reply that a reasoning model starts with its thinking', async () => {
    await severanceProtected();
    network({
      modelReplies: [deepseekReply('<think>The user wants {terms}. Maybe [Lumon]?</think>\n' + WELL_FORMED)],
    });

    await refreshTopic('severance');

    expect(aiTerms((await storedTopic()).terms)).toHaveLength(5);
  });

  it('doesn’t start building again while a build is still running', async () => {
    await severanceProtected();
    const { modelRequests } = network({ modelReplies: [deepseekReply(WELL_FORMED), deepseekReply(WELL_FORMED)] });

    await Promise.all([refreshTopic('severance'), refreshTopic('severance')]);

    expect(modelRequests()).toHaveLength(1);
  });

  it('still asks the model, by name alone, when Wikipedia is down', async () => {
    await severanceProtected();
    const { modelRequests } = network({
      wikipedia: new Response('Service Temporarily Unavailable', { status: 503 }),
      modelReplies: [deepseekReply(WELL_FORMED)],
    });

    await withTimePassing(refreshTopic('severance'));

    expect(JSON.stringify(modelRequests())).toContain('Severance');
    const stored = await storedTopic();
    expect(aiTerms(stored.terms)).toHaveLength(5);
    expect(stored.lastRefresh).toMatchObject({ ok: true, sourcesRead: ['Fandom'] });
  });
});

describe('when Wikipedia limits how often it can be asked', () => {
  const rateLimited = (retryAfter?: string) =>
    new Response('You are making too many requests to the API.', {
      status: 429,
      headers: retryAfter ? { 'Retry-After': retryAfter } : {},
    });

  it('waits as long as Wikipedia asks before trying again', async () => {
    await severanceProtected();
    const { wikipediaRequests } = network({ wikipediaFirst: [rateLimited('7')], modelReplies: [deepseekReply(WELL_FORMED)] });
    vi.useFakeTimers();

    const refreshed = refreshTopic('severance');
    await vi.advanceTimersByTimeAsync(6_900);
    expect(wikipediaRequests()).toBe(1);
    await vi.advanceTimersByTimeAsync(200);
    await refreshed;

    expect(wikipediaRequests()).toBe(3);
    expect((await storedTopic()).lastRefresh).toMatchObject({ ok: true, sourcesRead: ['Fandom', 'Wikipedia'] });
  });

  it('waits at least 5 seconds, then longer, when Wikipedia doesn’t say how long', async () => {
    await severanceProtected();
    const unavailable = () => new Response('Service Temporarily Unavailable', { status: 503 });
    const { wikipediaRequests } = network({
      wikipediaFirst: [unavailable(), unavailable()],
      modelReplies: [deepseekReply(WELL_FORMED)],
    });
    vi.useFakeTimers();

    const refreshed = refreshTopic('severance');
    await vi.advanceTimersByTimeAsync(4_900);
    expect(wikipediaRequests()).toBe(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(wikipediaRequests()).toBe(2);
    await vi.advanceTimersByTimeAsync(9_800);
    expect(wikipediaRequests()).toBe(2);
    await vi.advanceTimersByTimeAsync(200);
    await refreshed;

    expect((await storedTopic()).lastRefresh).toMatchObject({ ok: true, sourcesRead: ['Fandom', 'Wikipedia'] });
  });

  it('goes on without Wikipedia rather than wait longer than a minute', async () => {
    await severanceProtected();
    const { wikipediaRequests, modelRequests } = network({
      wikipedia: rateLimited('3600'),
      modelReplies: [deepseekReply(WELL_FORMED)],
    });

    await refreshTopic('severance');

    expect(wikipediaRequests()).toBe(1);
    expect(modelRequests()).toHaveLength(1);
    expect((await storedTopic()).lastRefresh).toMatchObject({ ok: true, sourcesRead: ['Fandom'] });
  });

  it('doesn’t ask again for an article that doesn’t exist', async () => {
    await severanceProtected();
    const { wikipediaRequests } = network({
      wikipedia: Response.json({ error: { code: 'badvalue' } }, { status: 400 }),
      modelReplies: [deepseekReply(WELL_FORMED)],
    });

    await refreshTopic('severance');

    expect(wikipediaRequests()).toBe(1);
  });
});

describe('the sources a topic is read from', () => {
  it('asks the model for the topic’s Fandom wiki and Wikipedia article the first time, and keeps the ones that exist', async () => {
    await severanceProtected();
    network({
      suggestion: suggests({ fandom: 'severance-tv.fandom.com', wikipedia: 'Severance (TV series)' }),
      modelReplies: [deepseekReply(WELL_FORMED)],
    });

    await refreshTopic('severance');

    expect((await storedTopic()).sources).toMatchObject({
      wiki: 'https://severance-tv.fandom.com/wiki/Severance',
      wikipedia: 'Severance (TV series)',
    });
  });

  it('drops a suggested wiki that doesn’t exist, and still builds terms', async () => {
    await severanceProtected();
    network({ suggestion: suggests({ fandom: 'severance-the-show.fandom.com', wikipedia: null }), modelReplies: [deepseekReply(WELL_FORMED)] });

    await refreshTopic('severance');

    const stored = await storedTopic();
    expect(stored.sources.wiki).toBeNull();
    expect(stored.lastRefresh).toMatchObject({ ok: true, sourcesRead: ['Wikipedia'] });
  });

  it('ignores a suggested address that isn’t a Fandom wiki', async () => {
    await severanceProtected();
    const { fetch } = network({ suggestion: suggests({ fandom: 'evil.example.com', wikipedia: null }), modelReplies: [deepseekReply(WELL_FORMED)] });

    await refreshTopic('severance');

    expect(fetch.mock.calls.map(([input]) => new URL(String(input)).hostname)).not.toContain('evil.example.com');
    expect((await storedTopic()).sources.wiki).toBeNull();
  });

  it('asks for sources only once, and never for a topic that has them', async () => {
    await severanceProtected();
    const { suggestionRequests } = network({ modelReplies: [deepseekReply(WELL_FORMED), deepseekReply(WELL_FORMED)] });

    await refreshTopic('severance');
    await refreshTopic('severance');

    expect(suggestionRequests()).toHaveLength(1);
  });

  it('reads the wiki page the topic names, and the pages added to that wiki recently', async () => {
    await protectionState.setValue({
      ...stateWithTopics({ ...topic('Severance', {}), sources: { wiki: 'https://severance-tv.fandom.com/wiki/Severance', subreddit: null } }),
      modelConnection: deepseek,
    });
    const { modelRequests, suggestionRequests } = network({ modelReplies: [deepseekReply(WELL_FORMED)] });

    await refreshTopic('severance');

    const sent = JSON.stringify(modelRequests());
    expect(suggestionRequests()).toHaveLength(0);
    // From the page, its infobox and its text.
    expect(sent).toContain('Aoife McArdle');
    expect(sent).toContain('Mohamad El Masri');
    // From the newest pages on the wiki.
    expect(sent).toContain('Lumon Gala');
    expect(sent).toContain('Overtime Contingency');
    // Wiki markup is cleaned away.
    expect(sent).not.toContain('[[');
    expect(sent).not.toContain('{{');
  });

  it('keeps the suggested sources even when building terms then fails', async () => {
    await severanceProtected();
    const { suggestionRequests } = network({
      suggestion: suggests({ fandom: 'severance-tv.fandom.com', wikipedia: 'Severance (TV series)' }),
      modelReplies: [Response.json({ error: { message: 'Insufficient Balance' } }, { status: 402 }), deepseekReply(WELL_FORMED)],
    });

    await refreshTopic('severance');
    expect((await storedTopic()).sources).toMatchObject({ wiki: 'https://severance-tv.fandom.com/', wikipedia: 'Severance (TV series)' });
    await refreshTopic('severance');

    expect(suggestionRequests()).toHaveLength(1);
    expect((await storedTopic()).sources.wiki).toBe('https://severance-tv.fandom.com/wiki/Severance');
  });

  it('asks for sources again next time when the model couldn’t answer', async () => {
    await severanceProtected();
    const { suggestionRequests } = network({
      suggestion: new Response('Bad gateway', { status: 502 }),
      modelReplies: [deepseekReply(WELL_FORMED), deepseekReply(WELL_FORMED)],
    });

    await refreshTopic('severance');
    await refreshTopic('severance');

    expect(suggestionRequests()).toHaveLength(2);
  });

  it('replaces a Wikipedia title that has no article with the article it finds', async () => {
    await severanceProtected();
    await updateProtection((state) =>
      changeTopic(state, 'severance', (changed) => ({ ...changed, sources: { ...changed.sources, wikipedia: 'Severance (season 9)' } })),
    );
    const { modelRequests } = network({ modelReplies: [deepseekReply(WELL_FORMED)] });

    await refreshTopic('severance');

    expect(JSON.stringify(modelRequests())).toContain('Ben Stiller');
    expect((await storedTopic()).sources.wikipedia).toBe('Severance (TV series)');
  });

  it('keeps a source the user changes while the refresh runs', async () => {
    await protectionState.setValue({
      ...stateWithTopics({ ...topic('Severance', {}), sources: { wiki: 'https://severance-tv.fandom.com/wiki/Severance', subreddit: null } }),
      modelConnection: deepseek,
    });
    network({
      modelReplies: [deepseekReply(WELL_FORMED)],
      beforeTerms: () =>
        updateProtection((state) =>
          changeTopic(state, 'severance', (changed) => ({ ...changed, sources: { ...changed.sources, wiki: null } })),
        ),
    });

    await refreshTopic('severance');

    expect((await storedTopic()).sources.wiki).toBeNull();
  });

  it('gives a long Fandom page most of the room, and still leaves Wikipedia some', async () => {
    await severanceProtected();
    const longPage = 'The Severed Floor holds Macrodata Refinement. '.repeat(800);
    const { modelRequests } = network({ fandomPageText: longPage, modelReplies: [deepseekReply(WELL_FORMED)] });

    await refreshTopic('severance');

    const material = modelRequests()[0]!.messages[1]!.content;
    const fromFandom = material.indexOf('From the Fandom wiki:');
    const fromWikipedia = material.indexOf('From Wikipedia:');
    expect(fromWikipedia - fromFandom).toBeGreaterThan(11_000);
    expect(material.length - fromWikipedia).toBeGreaterThan(3_000);
  });

  it('keeps the Fandom wiki’s material whole and trims Wikipedia first when there is too much', async () => {
    await severanceProtected();
    const { modelRequests } = network({ modelReplies: [deepseekReply(WELL_FORMED)] });

    await refreshTopic('severance');

    const material = modelRequests()[0]!.messages[1]!.content;
    expect(material.length).toBeLessThanOrEqual(16_500);
    // The Fandom page ends with its last section; the Wikipedia article is cut short.
    expect(material).toContain('Overtime Contingency');
    expect(material).toContain('Severance was met with critical acclaim upon its release.');
    expect(material).not.toContain(lastWords(wikipediaExtract.query.pages[0]!.extract));
    expect(material.indexOf('Fandom')).toBeLessThan(material.indexOf('Wikipedia'));
  });
});

/** The last few words of a text, as plain words. */
function lastWords(text: string): string {
  return text.trim().split(/\s+/).slice(-4).join(' ').replace(/[^\p{L}\p{N} ]/gu, '');
}

describe('browsing languages', () => {
  it('asks for terms in every browsing language and stores each with the language the model gives', async () => {
    await protectionState.setValue({
      ...addTopic(stateWithTopics(), 'Severance'),
      modelConnection: deepseek,
      browsingLanguages: ['en', 'es'],
    });
    const { modelRequests } = network({
      modelReplies: [
        deepseekReply(
          fenced({
            terms: [
              { text: 'Lumon Industries', level: 'common', strength: 'strong', language: 'en' },
              { text: 'Industrias Lumon', level: 'common', strength: 'strong', language: 'ES' },
              { text: 'Kier Eagan', level: 'common', strength: 'strong', language: 'fr' },
              { text: 'Cold Harbor', level: 'major', strength: 'strong' },
              { text: 'Optics and Design', level: 'minor', strength: 'strong', language: 'not a language' },
            ],
          }),
        ),
      ],
    });

    await refreshTopic('severance');

    const instructions = modelRequests()[0]!.messages[0]!.content;
    expect(instructions).toContain('English');
    expect(instructions).toContain('Spanish');
    expect(aiTerms((await storedTopic()).terms).map((term) => [term.text, term.language])).toEqual([
      ['Lumon Industries', 'en'],
      ['Industrias Lumon', 'es'],
      ['Kier Eagan', 'fr'],
      ['Cold Harbor', 'en'],
      ['Optics and Design', 'en'],
    ]);
  });
});

describe('merging new terms', () => {
  it('only adds, never changing a term the topic already has, however it is written', async () => {
    const existing: RelatedTerm = { text: 'Lumon', level: 'minor', strength: 'weak', language: 'en', addedBy: 'ai' };
    await protectionState.setValue({
      ...stateWithTopics({ ...topic('Severance', {}), terms: [existing] }),
      modelConnection: deepseek,
    });
    network({
      modelReplies: [
        deepseekReply(
          fenced({
            terms: [
              { text: '#lumon', level: 'common', strength: 'strong' },
              { text: 'LUMON', level: 'major', strength: 'strong' },
              { text: 'Kier Eagan', level: 'common', strength: 'strong' },
              { text: 'Kier  Eagan!', level: 'common', strength: 'strong' },
            ],
          }),
        ),
      ],
    });

    await refreshTopic('severance');

    expect((await storedTopic()).terms).toEqual([
      existing,
      { text: 'Kier Eagan', level: 'common', strength: 'strong', language: 'en', addedBy: 'ai' },
    ]);
  });

  it('keeps a spelling the matcher reads differently, such as "Cold Harbor" next to "Coldharbor"', async () => {
    const existing: RelatedTerm = { text: 'Coldharbor', level: 'major', strength: 'strong', language: 'en', addedBy: 'ai' };
    await protectionState.setValue({
      ...stateWithTopics({ ...topic('Severance', {}), terms: [existing] }),
      modelConnection: deepseek,
    });
    network({ modelReplies: [deepseekReply(fenced({ terms: [{ text: 'Cold Harbor', level: 'major', strength: 'strong' }] }))] });

    await refreshTopic('severance');

    expect((await storedTopic()).terms.map((term) => term.text)).toEqual(['Coldharbor', 'Cold Harbor']);
  });

  it('drops terms too short to point to the topic, and stores an everyday word as Weak', async () => {
    await severanceProtected();
    network({
      modelReplies: [
        deepseekReply(
          fenced({
            terms: [
              { text: 'S', level: 'common', strength: 'strong' },
              { text: '2', level: 'common', strength: 'strong' },
              { text: 'The', level: 'common', strength: 'strong' },
              { text: 'Lumon', level: 'Common', strength: 'Strong' },
              { text: 'Milchick', level: 'MINOR', strength: 'Weak' },
            ],
          }),
        ),
      ],
    });

    await refreshTopic('severance');

    expect(aiTerms((await storedTopic()).terms)).toEqual([
      { text: 'The', level: 'common', strength: 'weak', language: 'en', addedBy: 'ai' },
      { text: 'Lumon', level: 'common', strength: 'strong', language: 'en', addedBy: 'ai' },
      { text: 'Milchick', level: 'minor', strength: 'weak', language: 'en', addedBy: 'ai' },
    ]);
  });

  it('never changes your own terms, even when the model suggests the same word', async () => {
    await severanceProtected();
    await updateProtection((state) => addUserTerm(state, 'severance', 'Helly', { commonWord: false }));
    network({ modelReplies: [deepseekReply(WELL_FORMED)] });

    await refreshTopic('severance');

    const helly = (await storedTopic()).terms.filter((term) => term.text === 'Helly');
    expect(helly).toEqual([
      { text: 'Helly', level: 'common', strength: 'strong', language: 'und', addedBy: 'user' },
      { text: 'Helly', level: 'common', strength: 'weak', language: 'en', addedBy: 'ai' },
    ]);
  });

  it('stores a term with no Spoiler Level as Major, and one with no strength as Strong', async () => {
    await severanceProtected();
    network({
      modelReplies: [
        deepseekReply(
          fenced({
            terms: [
              { text: 'Gemma' },
              { text: 'Reghabilitation', level: 'catastrophic', strength: 'medium' },
              { text: 'Ricken', level: 'minor' },
              { level: 'common', strength: 'strong' },
            ],
          }),
        ),
      ],
    });

    await refreshTopic('severance');

    expect(aiTerms((await storedTopic()).terms)).toEqual([
      { text: 'Gemma', level: 'major', strength: 'strong', language: 'en', addedBy: 'ai' },
      { text: 'Reghabilitation', level: 'major', strength: 'strong', language: 'en', addedBy: 'ai' },
      { text: 'Ricken', level: 'minor', strength: 'strong', language: 'en', addedBy: 'ai' },
    ]);
  });
});

describe('when building terms fails', () => {
  it('asks once more after a malformed reply, and keeps the second answer', async () => {
    await severanceProtected();
    const { modelRequests } = network({
      modelReplies: [deepseekReply('Sure! Here are some terms: Lumon, Mark, Helly'), deepseekReply(WELL_FORMED)],
    });

    await refreshTopic('severance');

    expect(modelRequests()).toHaveLength(2);
    expect(aiTerms((await storedTopic()).terms)).toHaveLength(5);
  });

  it('asks once more when no term in the reply can be used', async () => {
    await severanceProtected();
    const { modelRequests } = network({
      modelReplies: [deepseekReply(fenced({ terms: [{ name: 'Lumon' }, { term: 'Helly' }] })), deepseekReply(WELL_FORMED)],
    });

    await refreshTopic('severance');

    expect(modelRequests()).toHaveLength(2);
    expect(aiTerms((await storedTopic()).terms)).toHaveLength(5);
  });

  it('records a failure when the model lists no terms at all, twice', async () => {
    await severanceProtected();
    network({ modelReplies: [deepseekReply(fenced({ terms: [] })), deepseekReply('[]')] });

    await refreshTopic('severance');

    expect((await storedTopic()).lastRefresh).toMatchObject({ ok: false, error: expect.stringMatching(/term list/) });
  });

  it('keeps the existing list and records the failure when the reply is malformed twice', async () => {
    await severanceProtected();
    const { modelRequests } = network({
      modelReplies: [deepseekReply('{"terms": [{"text": "Lumon"'), deepseekReply('I cannot help with that.')],
    });

    await refreshTopic('severance');

    const stored = await storedTopic();
    expect(modelRequests()).toHaveLength(2);
    expect(stored.terms).toEqual([]);
    expect(stored.lastRefresh).toEqual({ at: expect.any(Number), ok: false, error: expect.stringMatching(/term list/) });
  });

  it('keeps the existing list and records the provider’s error when the provider fails', async () => {
    await severanceProtected();
    network({ modelReplies: [Response.json({ error: { message: 'Insufficient Balance' } }, { status: 402 })] });

    await refreshTopic('severance');

    const stored = await storedTopic();
    expect(stored.terms).toEqual([]);
    expect(stored.lastRefresh).toEqual({
      at: expect.any(Number),
      ok: false,
      error: expect.stringContaining('Insufficient Balance'),
    });
  });

  it('records that the model’s server can’t be reached when its access was taken back', async () => {
    await severanceProtected();
    vi.mocked(fakeBrowser.permissions.contains).mockResolvedValue(false as never);
    const { fetch } = network({ modelReplies: [deepseekReply(WELL_FORMED)] });

    await refreshTopic('severance');

    expect(fetch).not.toHaveBeenCalled();
    expect((await storedTopic()).lastRefresh).toMatchObject({ ok: false, error: expect.stringMatching(/reach api\.deepseek\.com/) });
  });

  it('does nothing without a model: the topic keeps working on its name and your terms', async () => {
    await severanceProtected({ model: null });
    await updateProtection((state) => addUserTerm(state, 'severance', 'Lumon'));
    const { fetch } = network({ modelReplies: [] });

    await refreshTopic('severance');

    const stored = await storedTopic();
    expect(fetch).not.toHaveBeenCalled();
    expect(stored.terms.map((term) => term.text)).toEqual(['Lumon']);
    expect(stored.lastRefresh).toBeNull();
  });
});

describe('adding a topic', () => {
  it('builds its Related Terms when a model is connected', async () => {
    await protectionState.setValue({ ...stateWithTopics(), modelConnection: deepseek });
    network({ modelReplies: [deepseekReply(WELL_FORMED)] });
    const stop = watchForNewTopics();

    await updateProtection((state) => addTopic(state, 'Severance'));
    await vi.waitFor(async () => expect((await storedTopic()).lastRefresh).not.toBeNull());
    stop();

    expect(aiTerms((await storedTopic()).terms)).toHaveLength(5);
  });

  it('doesn’t contact anything when no model is connected', async () => {
    await protectionState.setValue(stateWithTopics());
    const { fetch } = network({ modelReplies: [] });
    const stop = watchForNewTopics();

    await updateProtection((state) => addTopic(state, 'Severance'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    stop();

    expect(fetch).not.toHaveBeenCalled();
    expect((await storedTopic()).lastRefresh).toBeNull();
  });
});
