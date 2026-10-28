import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { protectionState, type ModelConnection } from '@/protection/state';
import { connectModel, disconnectModel, MODEL_PRESETS } from './connection';

const deepseek: ModelConnection = {
  baseUrl: 'https://api.deepseek.com',
  apiKey: 'sk-test',
  model: 'deepseek-chat',
};

const ollama: ModelConnection = { baseUrl: 'http://localhost:11434/v1', apiKey: '', model: 'llama3.2' };

/** The model server's replies, in order; each is a Response or a thrown error. */
function serverReplies(...replies: (Response | Error)[]) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => {
    const reply = replies.shift() ?? new Error('No more replies');
    if (reply instanceof Error) throw reply;
    return reply;
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

const chatReply = (content: string) =>
  Response.json({ choices: [{ index: 0, message: { role: 'assistant', content } }] });

const errorReply = (status: number, message?: string) =>
  message === undefined
    ? new Response('', { status })
    : Response.json({ error: { message } }, { status });

let permissionRequests: string[][];

beforeEach(() => {
  fakeBrowser.reset();
  permissionRequests = [];
  vi.spyOn(fakeBrowser.permissions, 'request').mockImplementation(async ({ origins = [] }) => {
    permissionRequests.push(origins);
    return true;
  });
  vi.spyOn(fakeBrowser.permissions, 'remove').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('model presets', () => {
  it('offers DeepSeek first, then the other providers, the local ones and Custom', () => {
    expect(MODEL_PRESETS.map((preset) => preset.name)).toEqual([
      'DeepSeek',
      'OpenAI',
      'OpenRouter',
      'Groq',
      'Gemini',
      'Anthropic',
      'Ollama',
      'LM Studio',
      'Custom',
    ]);
    expect(MODEL_PRESETS.filter((preset) => preset.local).map((preset) => preset.name)).toEqual([
      'Ollama',
      'LM Studio',
    ]);
  });
});

describe('connecting a model', () => {
  it('asks for access to the server’s address, tests it, and stores the connection locally', async () => {
    const fetch = serverReplies(chatReply('OK'));

    const result = await connectModel(deepseek);

    expect(result).toMatchObject({ ok: true });
    expect(permissionRequests).toEqual([['https://api.deepseek.com/*']]);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer sk-test');
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'deepseek-chat' });
    expect((await protectionState.getValue()).modelConnection).toEqual(deepseek);
    expect(await fakeBrowser.storage.sync.get()).toEqual({});
  });

  it('accepts an address pasted with a trailing slash or the full endpoint path', async () => {
    const fetch = serverReplies(chatReply('OK'));

    await connectModel({ ...deepseek, baseUrl: ' https://api.deepseek.com/v1/chat/completions/ ' });

    expect(fetch.mock.calls[0]![0]).toBe('https://api.deepseek.com/v1/chat/completions');
    expect((await protectionState.getValue()).modelConnection?.baseUrl).toBe('https://api.deepseek.com/v1');
  });

  it('sends no API key when none is given, as for a local model', async () => {
    const fetch = serverReplies(chatReply('OK'));

    await connectModel(ollama);

    expect(permissionRequests).toEqual([['http://localhost/*']]);
    expect(new Headers(fetch.mock.calls[0]![1]?.headers).has('authorization')).toBe(false);
  });

  it('keeps a model that replies with empty text, since it still answered', async () => {
    serverReplies(chatReply(''));

    expect(await connectModel(deepseek)).toMatchObject({ ok: true });
  });
});

describe('when connecting fails', () => {
  it.each([
    ['the API key is refused', errorReply(401, 'Authentication Fails'), /API key/],
    ['the model doesn’t exist', errorReply(404, 'Model Not Exist'), /deepseek-chat/],
    ['the account is out of credit or rate limited', errorReply(429), /limit|credit/i],
    ['the provider is down', errorReply(503), /503/],
    ['the reply isn’t chat completions', new Response('<html>Welcome</html>'), /OpenAI-compatible/],
    ['the server can’t be reached', new TypeError('Failed to fetch'), /reach api\.deepseek\.com/],
  ])('says so in words when %s, and stores nothing', async (_case, reply, message) => {
    serverReplies(reply);

    const result = await connectModel(deepseek);

    expect(result).toEqual({ ok: false, message: expect.stringMatching(message) });
    expect((await protectionState.getValue()).modelConnection).toBeNull();
  });

  it('passes on the provider’s own explanation', async () => {
    serverReplies(errorReply(400, 'Model Not Exist'));

    expect(await connectModel(deepseek)).toEqual({ ok: false, message: expect.stringContaining('Model Not Exist') });
  });

  it('points to the Ollama setting when Ollama refuses the extension', async () => {
    serverReplies(errorReply(403));

    expect(await connectModel(ollama)).toEqual({ ok: false, message: expect.stringContaining('OLLAMA_ORIGINS') });
  });

  it('asks whether Ollama is running when nothing answers on its port', async () => {
    serverReplies(new TypeError('Failed to fetch'));

    expect(await connectModel(ollama)).toEqual({ ok: false, message: expect.stringMatching(/Ollama.*running/) });
  });

  it('doesn’t contact the server when access to its address is declined', async () => {
    vi.mocked(fakeBrowser.permissions.request).mockResolvedValue(false as never);
    const fetch = serverReplies(chatReply('OK'));

    const result = await connectModel(deepseek);

    expect(result).toEqual({ ok: false, message: expect.stringMatching(/permission.*api\.deepseek\.com/i) });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['', 'api.deepseek.com', 'ftp://example.com'])('refuses the server address "%s"', async (baseUrl) => {
    const fetch = serverReplies(chatReply('OK'));

    const result = await connectModel({ ...deepseek, baseUrl });

    expect(result).toEqual({ ok: false, message: expect.stringMatching(/full server address/) });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('asks for a model name when it is missing', async () => {
    expect(await connectModel({ ...deepseek, model: ' ' })).toEqual({
      ok: false,
      message: expect.stringMatching(/model name/i),
    });
  });
});

describe('access to model servers', () => {
  it('gives back access to the old server when another one is connected', async () => {
    serverReplies(chatReply('OK'), chatReply('OK'));
    await connectModel(ollama);

    await connectModel(deepseek);

    expect(fakeBrowser.permissions.remove).toHaveBeenCalledWith({ origins: ['http://localhost/*'] });
    expect(fakeBrowser.permissions.remove).not.toHaveBeenCalledWith({ origins: ['https://api.deepseek.com/*'] });
  });

  it('gives back access it asked for when the test fails', async () => {
    serverReplies(errorReply(401));

    await connectModel(deepseek);

    expect(fakeBrowser.permissions.remove).toHaveBeenCalledWith({ origins: ['https://api.deepseek.com/*'] });
  });

  it('keeps access to the connected server when a new test of it fails', async () => {
    serverReplies(chatReply('OK'), errorReply(401));
    await connectModel(deepseek);

    await connectModel({ ...deepseek, apiKey: 'sk-wrong' });

    expect(fakeBrowser.permissions.remove).not.toHaveBeenCalled();
    expect((await protectionState.getValue()).modelConnection).toEqual(deepseek);
  });
});

describe('disconnecting the model', () => {
  it('forgets the connection and gives back access to its address', async () => {
    serverReplies(chatReply('OK'));
    await connectModel(deepseek);

    await disconnectModel();

    expect((await protectionState.getValue()).modelConnection).toBeNull();
    expect(fakeBrowser.permissions.remove).toHaveBeenCalledWith({ origins: ['https://api.deepseek.com/*'] });
  });
});
