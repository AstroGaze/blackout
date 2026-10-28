import { storage } from 'wxt/utils/storage';

/** A site Blackout protects. */
export type Site = 'youtube' | 'reddit' | 'x';

export type SpoilerLevel = 'common' | 'minor' | 'major';

export type TermStrength = 'strong' | 'weak';

export interface RelatedTerm {
  text: string;
  level: SpoilerLevel;
  strength: TermStrength;
  /** BCP 47 language code of the term. */
  language: string;
  /** Terms shipped with a preset count as AI-added: refreshes may extend them. */
  addedBy: 'ai' | 'user';
}

export interface ProtectedTopic {
  id: string;
  name: string;
  enabled: boolean;
  /** Epoch ms when a Pause ends, or null when not paused. */
  pausedUntil: number | null;
  sources: { wiki: string | null; subreddit: string | null };
  lastRefresh: { at: number; ok: boolean; error?: string } | null;
  terms: RelatedTerm[];
}

export interface BlockedSource {
  site: Site;
  account: string;
}

export interface ModelConnection {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ProtectionState {
  topics: ProtectedTopic[];
  blockedSources: BlockedSource[];
  /** Hidden Item counts keyed by source, topic and day. */
  suggestedBlockCounts: Record<string, number>;
  modelConnection: ModelConnection | null;
  browsingLanguages: string[];
  blurAllThumbnails: boolean;
}

const term = (text: string, strength: TermStrength): RelatedTerm => ({
  text,
  level: 'common',
  strength,
  language: 'en',
  addedBy: 'ai',
});

export const GTA6_PRESET: ProtectedTopic = {
  id: 'gta-6',
  name: 'GTA 6',
  enabled: true,
  pausedUntil: null,
  sources: {
    wiki: 'https://gta.fandom.com/wiki/Grand_Theft_Auto_VI',
    subreddit: 'GTA6',
  },
  lastRefresh: null,
  terms: [
    term('GTA 6', 'strong'),
    term('GTA VI', 'strong'),
    term('Grand Theft Auto VI', 'strong'),
    term('#GTA6', 'strong'),
    term('Leonida', 'strong'),
    term('Jason', 'weak'),
    term('Lucia', 'weak'),
    // Also names the 2002 game, so it can't identify GTA 6 on its own.
    term('Vice City', 'weak'),
  ],
};

/**
 * Whether a topic protects right now: not switched off and not paused. Only an
 * explicit switch-off counts, so a missing flag keeps protection on.
 */
export function isTopicActive(topic: ProtectedTopic, now = Date.now()): boolean {
  return topic.enabled !== false && !isPaused(topic, now);
}

export function isPaused(topic: ProtectedTopic, now = Date.now()): boolean {
  return typeof topic.pausedUntil === 'number' && topic.pausedUntil > now;
}

/** When the next Pause ends (epoch ms), or null when nothing is paused. */
export function nextPauseEnd(state: ProtectionState, now = Date.now()): number | null {
  const ends = state.topics.filter((topic) => isPaused(topic, now)).map((topic) => topic.pausedUntil!);
  return ends.length > 0 ? Math.min(...ends) : null;
}

export function initialProtectionState(): ProtectionState {
  return {
    topics: [structuredClone(GTA6_PRESET)],
    blockedSources: [],
    suggestedBlockCounts: {},
    modelConnection: null,
    browsingLanguages: ['en'],
    blurAllThumbnails: false,
  };
}

/** The single source of truth, kept in local (never synced) extension storage. */
export const protectionState = storage.defineItem<ProtectionState>('local:protectionState', {
  init: initialProtectionState,
});
