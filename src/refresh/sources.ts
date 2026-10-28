// Background material about a topic, read from Wikipedia and its Fandom wiki
// for the model. The user never sees any of it.

import { sameTerm } from '@/protection/topics';

/** A source's text, ready for the model. */
export interface SourceText {
  source: 'Fandom' | 'Wikipedia';
  text: string;
}

/** How each source is introduced to the model. */
const HEADINGS = { Fandom: 'From the Fandom wiki:\n', Wikipedia: 'From Wikipedia:\n' } as const;

/**
 * The share of the room the Fandom wiki may take when there is too much. It
 * counts most, since its community adds characters and places first, but
 * Wikipedia always keeps the rest.
 */
const FANDOM_SHARE = 0.75;

/**
 * The sources' text as one piece no longer than `limit`, the Fandom wiki first.
 * When there is too much, Wikipedia is trimmed first, down to its share of the
 * room; room one source doesn't need goes to the other.
 */
export function combineMaterial(parts: SourceText[], limit: number): string | null {
  const fandom = parts.find((part) => part.source === 'Fandom')?.text.trim() ?? '';
  const wikipedia = parts.find((part) => part.source === 'Wikipedia')?.text.trim() ?? '';
  const room = limit - HEADINGS.Fandom.length - HEADINGS.Wikipedia.length - 2;
  let fandomSize = Math.min(fandom.length, wikipedia ? Math.floor(room * FANDOM_SHARE) : room);
  const wikipediaSize = Math.min(wikipedia.length, room - fandomSize);
  fandomSize = Math.min(fandom.length, room - wikipediaSize);
  const sections = [
    ...(fandom ? [HEADINGS.Fandom + fandom.slice(0, fandomSize)] : []),
    ...(wikipedia ? [HEADINGS.Wikipedia + wikipedia.slice(0, wikipediaSize)] : []),
  ];
  return sections.length > 0 ? sections.join('\n\n') : null;
}

/** Media types Wikipedia puts in brackets after a title, as in "Severance (TV series)". */
const MEDIA_QUALIFIER =
  /\s*\((?:\d{4} )?(?:[\w-]+ )?(?:video game|game|film|movie|TV series|television series|miniseries|series|novel|book|anime|manga|comics?|web series)\)$/i;

/** Any bracketed qualifier after a title. */
const QUALIFIER = /\s*\(.*\)$/;

/** The best of a wiki's search results for the topic: its own page, the media one if several share its name. */
function bestTitle(titles: string[], name: string): string | undefined {
  const sharesTopicName = (title: string) => sameTerm(title.replace(QUALIFIER, ''), name);
  return (
    titles.find((candidate) => sharesTopicName(candidate) && MEDIA_QUALIFIER.test(candidate)) ??
    titles.find(sharesTopicName) ??
    titles[0]
  );
}

type SearchReply = { query?: { search?: { title: string }[] } };

/** The titles of a wiki's best five pages for `name`. */
async function searchTitles(api: string, name: string): Promise<string[]> {
  const search = await readJson<SearchReply>(
    `${api}?${new URLSearchParams({ action: 'query', list: 'search', srsearch: name, srlimit: '5', srprop: '', format: 'json', formatversion: '2' })}`,
  );
  return search?.query?.search?.map((result) => result.title) ?? [];
}

/**
 * The topic's Wikipedia article as plain text, or null when Wikipedia can't be
 * read. It reads `title` when one is known, and otherwise searches for the topic.
 */
export async function wikipediaArticle(
  name: string,
  language: string,
  title?: string | null,
): Promise<{ title: string; text: string } | null> {
  // Wikipedia's sites go by language alone: "pt", not "pt-BR".
  const api = `https://${language.split('-')[0]!.toLowerCase()}.wikipedia.org/w/api.php`;
  const read = async (page: string) => {
    const article = await readJson<{ query?: { pages?: { title?: string; extract?: string; missing?: boolean }[] } }>(
      `${api}?${new URLSearchParams({ action: 'query', prop: 'extracts', explaintext: '1', exsectionformat: 'plain', titles: page, redirects: '1', format: 'json', formatversion: '2' })}`,
    );
    const found = article?.query?.pages?.[0];
    const text = found?.extract?.trim();
    return text ? { title: found?.title ?? page, text } : null;
  };
  if (title) {
    const article = await read(title);
    if (article) return article;
  }
  const best = bestTitle(await searchTitles(api, name), name);
  return best ? read(best) : null;
}

/** Whether `host` is a Fandom wiki's address, such as "gta.fandom.com". */
export function isFandomHost(host: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.fandom\.com$/i.test(host);
}

/** Whether the Fandom wiki at `host` exists. */
export async function fandomWikiExists(host: string): Promise<boolean> {
  if (!isFandomHost(host)) return false;
  const info = await readJson<{ query?: { general?: unknown } }>(
    `https://${host}/api.php?action=query&meta=siteinfo&format=json&formatversion=2`,
  );
  return Boolean(info?.query?.general);
}

/**
 * Where a Fandom wiki address points: the wiki's API, with its language path
 * such as "/es", and the page title if it names one. Null when it isn't a
 * Fandom wiki's address.
 */
export function parseWikiAddress(address: string): { api: string; base: string; title: string | null } | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(address.trim()) ? address.trim() : `https://${address.trim()}`);
  } catch {
    return null;
  }
  if (!isFandomHost(url.hostname)) return null;
  const match = /^(\/[a-z]{2,3}(?:-[a-z]+)?)?(?:\/wiki\/(.+))?\/?$/i.exec(url.pathname);
  if (!match) return null;
  const base = `https://${url.hostname.toLowerCase()}${match[1] ?? ''}`;
  const title = match[2] ? decodeURIComponent(match[2]).replaceAll('_', ' ') : null;
  return { api: `${base}/api.php`, base, title };
}

/** The address of a page on a Fandom wiki, as "https://gta.fandom.com/wiki/Grand_Theft_Auto_VI". */
export function wikiPageUrl(base: string, title: string): string {
  return `${base}/wiki/${encodeURI(title.replaceAll(' ', '_'))}`;
}

/**
 * The topic's page on its Fandom wiki as plain text, led by the titles of pages
 * added to the wiki recently, which is where characters and places revealed
 * after release appear first. Null when the wiki can't be read.
 */
export async function fandomMaterial(address: string, name: string): Promise<{ pageUrl: string; text: string } | null> {
  const wiki = parseWikiAddress(address);
  if (!wiki) return null;
  const title = wiki.title ?? bestTitle(await searchTitles(wiki.api, name), name);
  if (!title) return null;

  const page = await readJson<{ parse?: { title?: string; wikitext?: string } }>(
    `${wiki.api}?${new URLSearchParams({ action: 'parse', page: title, prop: 'wikitext', redirects: '1', format: 'json', formatversion: '2' })}`,
  );
  const recent = await readJson<{ query?: { recentchanges?: { title: string }[] } }>(
    `${wiki.api}?${new URLSearchParams({ action: 'query', list: 'recentchanges', rctype: 'new', rcnamespace: '0', rclimit: '50', rcprop: 'title', format: 'json', formatversion: '2' })}`,
  );
  const pageText = page?.parse?.wikitext ? plainWikitext(page.parse.wikitext) : '';
  const newPages = [...new Set(recent?.query?.recentchanges?.map((change) => change.title) ?? [])];
  if (pageText === '' && newPages.length === 0) return null;

  const pageUrl = wikiPageUrl(wiki.base, page?.parse?.title ?? title);
  const lead = newPages.length > 0 ? `Pages added to the wiki recently: ${newPages.join(', ')}.\n\n` : '';
  return { pageUrl, text: lead + pageText };
}

/** Wiki markup reduced to readable text: links to their words, infobox fields to "field: value". */
function plainWikitext(wikitext: string): string {
  return wikitext
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[\s\S]*?<\/ref>/gi, '')
    .replace(/<gallery[\s\S]*?<\/gallery>/gi, '')
    .replace(/\[\[(?:File|Image|Category):[^\]]*\]\]/gi, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\/\/\S+\s([^\]]*)\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/^\s*\|\s*([\w ]+?)\s*=\s*/gm, '$1: ')
    .replace(/\{\{|\}\}/g, '')
    .replace(/^=+\s*(.*?)\s*=+\s*$/gm, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Wikimedia asks browser clients to name themselves in this header, with a way
 * to reach the developer.
 */
const API_USER_AGENT = 'Blackout/0.1 (https://github.com/AstroGaze/blackout; spoiler-blocking browser extension)';

const READ_TIMEOUT_MS = 20_000;

/** A site is asked at most this many times for each thing Blackout reads. */
const ATTEMPTS = 3;

/** Waiting longer than this would hold up the refresh too long. */
const LONGEST_WAIT_MS = 60_000;

/** The longest reading one thing can take, waits included. */
export const LONGEST_READ_MS = ATTEMPTS * READ_TIMEOUT_MS + (ATTEMPTS - 1) * LONGEST_WAIT_MS;

/**
 * Fetches JSON, or null when it can't be read. When the site is busy or
 * limiting requests, it waits as long as the site asks, or else 5 and then 10
 * seconds, as Wikimedia's rate-limit rules ask clients to.
 */
async function readJson<T>(url: string): Promise<T | null> {
  for (let attempt = 1; ; attempt++) {
    let wait: number;
    try {
      const response = await fetch(url, {
        headers: { 'Api-User-Agent': API_USER_AGENT },
        signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      });
      if (response.ok) return (await response.json().catch(() => null)) as T | null;
      // Only a busy or rate-limited site is worth asking again.
      if (response.status !== 429 && response.status < 500) return null;
      wait = retryAfterMs(response.headers.get('Retry-After')) ?? 5_000 * 2 ** (attempt - 1);
    } catch {
      wait = 5_000 * 2 ** (attempt - 1);
    }
    if (attempt === ATTEMPTS || wait > LONGEST_WAIT_MS) return null;
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
