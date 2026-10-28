// When Related Terms are refreshed: daily, on "Refresh now", and for new topics.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { protectionState, type ModelConnection, type ProtectedTopic } from '@/protection/state';
import { pauseTopic, setTopicEnabled } from '@/protection/topics';
import { stateWithTopics, topic } from '@/test/state';
import { DAILY_REFRESH_ALARM, requestRefresh, startBackgroundRefresh } from './schedule';

const model: ModelConnection = { baseUrl: 'https://api.deepseek.com', apiKey: 'sk-test', model: 'deepseek-chat' };
const HOUR = 60 * 60 * 1000;

/** A model that lists one term, and no Fandom wiki or Wikipedia to read. */
function quietNetwork() {
  const fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname !== 'api.deepseek.com') return new Response('Not found', { status: 404 });
    const { messages } = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
    const content = messages[0]!.content.startsWith('You build term lists')
      ? '{"terms":[{"text":"Kier Eagan","level":"common","strength":"strong"}]}'
      : '{"fandom":null,"wikipedia":null}';
    return Response.json({ choices: [{ message: { role: 'assistant', content } }] });
  });
  vi.stubGlobal('fetch', fetch);
  /** The topics the model was asked about, in order. */
  return () =>
    fetch.mock.calls
      .filter(([input]) => new URL(String(input)).hostname === 'api.deepseek.com')
      .map(([, init]) => JSON.parse(String(init?.body)) as { messages: { content: string }[] })
      .filter((body) => body.messages[0]!.content.startsWith('You build term lists'))
      .map((body) => /^Media: (.*)$/m.exec(body.messages[1]!.content)![1]);
}

const refreshedAt = (at: number): Partial<ProtectedTopic> => ({
  lastRefresh: { at, ok: true, added: 0, sourcesRead: [] },
  sources: { wiki: null, subreddit: null, wikipedia: null },
});

let stop: (() => void) | undefined;

beforeEach(() => {
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true as never);
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the daily refresh', () => {
  it('is scheduled once a day, and not again when the background starts again', async () => {
    stop = startBackgroundRefresh();
    await vi.waitFor(async () => expect(await fakeBrowser.alarms.getAll()).toHaveLength(1));
    stop();
    stop = startBackgroundRefresh();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const alarms = await fakeBrowser.alarms.getAll();
    expect(alarms).toEqual([expect.objectContaining({ name: DAILY_REFRESH_ALARM, periodInMinutes: 24 * 60 })]);
  });

  it('refreshes every topic not switched off, paused ones too, unless refreshed well in the last 20 hours', async () => {
    const now = Date.now();
    let state = stateWithTopics(
      { ...topic('Severance', {}), ...refreshedAt(now - 30 * HOUR) },
      { ...topic('Dune', {}), ...refreshedAt(now - 30 * HOUR) },
      { ...topic('Lost', {}), ...refreshedAt(now - 30 * HOUR) },
      { ...topic('Andor', {}), ...refreshedAt(now - 2 * HOUR) },
      { ...topic('Fargo', {}), ...refreshedAt(now - 2 * HOUR), lastRefresh: { at: now - 2 * HOUR, ok: false, error: 'Down' } },
    );
    state = setTopicEnabled(state, 'dune', false);
    state = pauseTopic(state, 'lost', now + HOUR);
    await protectionState.setValue({ ...state, modelConnection: model });
    quietNetwork();
    stop = startBackgroundRefresh();

    await fakeBrowser.alarms.onAlarm.trigger({ name: DAILY_REFRESH_ALARM, scheduledTime: now, persistAcrossSessions: true });
    const refreshedNow = async () =>
      (await protectionState.getValue()).topics.filter((t) => t.lastRefresh!.at >= now).map((t) => t.name);
    await vi.waitFor(async () => expect(await refreshedNow()).toHaveLength(3), { timeout: 5000 });

    expect(await refreshedNow()).toEqual(['Severance', 'Lost', 'Fargo']);
  });
});

describe('Refresh now', () => {
  it('refreshes that topic straight away, even one refreshed an hour ago', async () => {
    const now = Date.now();
    await protectionState.setValue({
      ...stateWithTopics({ ...topic('Severance', {}), ...refreshedAt(now - HOUR) }, topic('Dune', {})),
      modelConnection: model,
    });
    const askedAbout = quietNetwork();
    stop = startBackgroundRefresh();

    await requestRefresh('severance');
    await vi.waitFor(async () =>
      expect((await protectionState.getValue()).topics[0]!.lastRefresh!.at).toBeGreaterThan(now),
    );

    expect(askedAbout()).toEqual(['Severance']);
    expect((await protectionState.getValue()).topics[0]!.terms.map((term) => term.text)).toEqual(['Kier Eagan']);
  });
});
