// The refresh seam: recorded network responses in, the stored term list out.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { protectionState, type ModelConnection, type RelatedTerm } from '@/protection/state';
import { addTopic, addUserTerm, updateProtection } from '@/protection/topics';
import { stateWithTopics, topic } from '@/test/state';
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

/**
 * Replaces the network: Wikipedia answers with `wikipediaFirst` in order, then
 * from the recorded responses (or always with `wikipedia`), and the model server
 * gives `modelReplies` in order.
 */
function network({
  wikipedia,
  wikipediaFirst = [],
  modelReplies,
}: {
  wikipedia?: Response;
  wikipediaFirst?: Response[];
  modelReplies: Response[];
}) {
  const fetch = vi.fn(async (input: string | URL, _init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname.endsWith('.wikipedia.org')) {
      const next = wikipediaFirst.shift();
      if (next) return next;
      if (wikipedia) return wikipedia.clone();
      if (url.searchParams.get('list') === 'search') return Response.json(wikipediaSearch);
      return url.searchParams.get('titles') === 'Severance (TV series)'
        ? Response.json(wikipediaExtract)
        : Response.json(otherArticle(url.searchParams.get('titles') ?? ''));
    }
    if (url.hostname === 'api.deepseek.com') {
      return modelReplies.shift() ?? new Response('No more replies', { status: 500 });
    }
    throw new TypeError(`Unexpected request to ${url}`);
  });
  vi.stubGlobal('fetch', fetch);
  const wikipediaRequests = () =>
    fetch.mock.calls.filter(([input]) => new URL(String(input)).hostname.endsWith('.wikipedia.org')).length;
  const modelRequests = () =>
    fetch.mock.calls
      .filter(([input]) => new URL(String(input)).hostname === 'api.deepseek.com')
      .map(([, init]) => JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] });
  return { fetch, modelRequests, wikipediaRequests };
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
    expect(stored.lastRefresh).toEqual({ at: expect.any(Number), ok: true, added: 5, sourcesRead: ['Wikipedia'] });
  });

  it('sends the model only the topic’s name and the Wikipedia article about it', async () => {
    await severanceProtected();
    await updateProtection((state) => addUserTerm(state, 'severance', 'my own secret term'));
    const { fetch, modelRequests } = network({ modelReplies: [deepseekReply(WELL_FORMED)] });

    await refreshTopic('severance');

    const sent = JSON.stringify(modelRequests());
    expect(sent).toContain('Severance');
    expect(sent).toContain('Lumon Industries');
    expect(sent).not.toContain('my own secret term');
    const hosts = new Set(fetch.mock.calls.map(([input]) => new URL(String(input)).hostname));
    expect(hosts).toEqual(new Set(['en.wikipedia.org', 'api.deepseek.com']));
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
    expect(stored.lastRefresh).toMatchObject({ ok: true, sourcesRead: [] });
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
    expect((await storedTopic()).lastRefresh).toMatchObject({ ok: true, sourcesRead: ['Wikipedia'] });
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

    expect((await storedTopic()).lastRefresh).toMatchObject({ ok: true, sourcesRead: ['Wikipedia'] });
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
    expect((await storedTopic()).lastRefresh).toMatchObject({ ok: true, sourcesRead: [] });
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
