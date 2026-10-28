import { browser } from 'wxt/browser';
import { protectionState, type ModelConnection } from '@/protection/state';
import { updateProtection } from '@/protection/topics';

export interface ModelPreset {
  name: string;
  baseUrl: string;
  model: string;
  /** Runs on the user's own computer, so it needs no API key. */
  local?: boolean;
  /** Shown in the empty model name field, when the preset can't name one. */
  modelPlaceholder?: string;
}

/**
 * Providers that speak OpenAI-compatible chat completions (ADR-0001). A preset
 * only fills in the form; every field stays editable.
 */
export const MODEL_PRESETS: readonly ModelPreset[] = [
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5-mini' },
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-chat' },
  { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  { name: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
  { name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-haiku-5-5' },
  { name: 'Ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', local: true },
  {
    name: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    model: '',
    local: true,
    modelPlaceholder: 'The model loaded in LM Studio',
  },
  { name: 'Custom', baseUrl: '', model: '' },
];

/** The preset a stored connection was made from, or Custom when none matches. */
export function presetFor(connection: ModelConnection): ModelPreset {
  return (
    MODEL_PRESETS.find((preset) => preset.baseUrl !== '' && preset.baseUrl === connection.baseUrl) ??
    MODEL_PRESETS.find((preset) => preset.name === 'Custom')!
  );
}

export type ConnectionResult = { ok: true; replyMs: number } | { ok: false; message: string };

/** Why the model couldn't be reached or answered badly, worded for the person using it. */
export class ConnectionError extends Error {}

/**
 * Connects the model: asks for access to the server's address, checks that the
 * model answers, and stores the connection in this browser only. Call it from a
 * click, since the browser only asks for access in response to one.
 */
export async function connectModel(form: ModelConnection): Promise<ConnectionResult> {
  let connection: ModelConnection;
  try {
    connection = cleanConnection(form);
  } catch (failure) {
    return failed(failure);
  }
  const origin = originPattern(connection.baseUrl);
  // Ask first, while the click still counts as the user's.
  const granted = await browser.permissions.request({ origins: [origin] });
  const previous = (await protectionState.getValue()).modelConnection;
  const previousOrigin = previous && originPattern(previous.baseUrl);
  try {
    if (!granted) throw new ConnectionError(`Blackout needs your permission to reach ${hostOf(connection)}.`);
    const started = Date.now();
    await chatCompletion(connection, [{ role: 'user', content: 'Reply with the word OK.' }]);
    const replyMs = Date.now() - started;
    await updateProtection((state) => ({ ...state, modelConnection: connection }));
    // Blackout only keeps access to the server it uses.
    if (previousOrigin && previousOrigin !== origin) await browser.permissions.remove({ origins: [previousOrigin] });
    return { ok: true, replyMs };
  } catch (failure) {
    if (granted && origin !== previousOrigin) await browser.permissions.remove({ origins: [origin] });
    return failed(failure);
  }
}

function failed(failure: unknown): ConnectionResult {
  if (failure instanceof ConnectionError) return { ok: false, message: failure.message };
  throw failure;
}

/** Forgets the model connection and gives back access to its address. */
export async function disconnectModel(): Promise<void> {
  const { modelConnection } = await protectionState.getValue();
  await updateProtection((state) => ({ ...state, modelConnection: null }));
  if (modelConnection) await browser.permissions.remove({ origins: [originPattern(modelConnection.baseUrl)] });
}

/** Whether Blackout can still reach the connected server; access can be taken back in the browser. */
export async function hasModelAccess(connection: ModelConnection): Promise<boolean> {
  return browser.permissions.contains({ origins: [originPattern(connection.baseUrl)] });
}

function hostOf(connection: ModelConnection): string {
  return new URL(connection.baseUrl).host;
}

/** The connection as typed, tidied: a bare server address, trimmed fields. */
function cleanConnection(form: ModelConnection): ModelConnection {
  const baseUrl = form.baseUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/, '');
  let url: URL | null = null;
  try {
    url = new URL(baseUrl);
  } catch {
    // Reported below.
  }
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    throw new ConnectionError('Type the full server address, such as https://api.deepseek.com.');
  }
  const model = form.model.trim();
  if (model === '') throw new ConnectionError('Type the model name, as your provider lists it.');
  return { baseUrl, apiKey: form.apiKey.trim(), model };
}

/** The match pattern that grants access to every path on the server's address. */
function originPattern(baseUrl: string): string {
  const { protocol, hostname } = new URL(baseUrl);
  // Match patterns can't name a port; the host covers all of its ports.
  return `${protocol}//${hostname}/*`;
}

function isOllama(baseUrl: string): boolean {
  const { hostname, port } = new URL(baseUrl);
  return port === '11434' && (hostname === 'localhost' || hostname === '127.0.0.1');
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Sends a chat-completions request and returns the reply's text. */
export async function chatCompletion(
  connection: ModelConnection,
  messages: ChatMessage[],
  { timeoutMs = 60_000 } = {},
): Promise<string> {
  const host = hostOf(connection);
  const headers = new Headers({ 'content-type': 'application/json' });
  if (connection.apiKey) headers.set('authorization', `Bearer ${connection.apiKey}`);

  let response: Response;
  try {
    response = await fetch(`${connection.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: connection.model, messages }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (failure) {
    if (failure instanceof DOMException && failure.name === 'TimeoutError') {
      throw new ConnectionError(`${host} took too long to answer.`);
    }
    if (isOllama(connection.baseUrl)) {
      throw new ConnectionError('Couldn’t reach Ollama. Is it running on this computer?');
    }
    throw new ConnectionError(`Couldn’t reach ${host}. Check the server address and your connection.`);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ConnectionError(failureMessage(connection, response.status, body));
  const content = (body as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message
    ?.content;
  if (content === undefined) {
    throw new ConnectionError(`${host} answered, but not in the OpenAI-compatible format Blackout speaks.`);
  }
  return typeof content === 'string' ? content : '';
}

function failureMessage(connection: ModelConnection, status: number, body: unknown): string {
  const host = hostOf(connection);
  const explanation = providerExplanation(body);
  const because = explanation ? ` It said: “${explanation}”` : '';

  if (status === 403 && isOllama(connection.baseUrl)) {
    return 'Ollama refused Blackout. Allow browser extensions by setting OLLAMA_ORIGINS to chrome-extension://*, then restart Ollama.';
  }
  if (status === 401 || status === 403) return `${host} refused the API key.${because}`;
  if (status === 404) {
    return `${host} couldn’t find the model “${connection.model}” or the chat-completions address.${because}`;
  }
  if (status === 402 || status === 429) {
    return `${host} is limiting requests, or the account is out of credit.${because}`;
  }
  return `${host} answered with an error (${status}).${because}`;
}

/** The provider's own words from an OpenAI-style error body, if it gave any. */
function providerExplanation(body: unknown): string | null {
  const error = (body as { error?: unknown } | null)?.error;
  if (typeof error === 'string') return error;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : null;
}
