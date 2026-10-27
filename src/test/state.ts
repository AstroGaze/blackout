// Helpers for building protection states in tests.

import {
  GTA6_PRESET,
  initialProtectionState,
  type ProtectedTopic,
  type ProtectionState,
  type RelatedTerm,
} from '@/protection/state';

/** A fresh copy of the ready-made GTA 6 topic. */
export const gta6 = (): ProtectedTopic => structuredClone(GTA6_PRESET);

/** A switched-on topic with the given Strong and Weak Terms, all in one language. */
export function topic(
  name: string,
  terms: { strong?: string[]; weak?: string[]; language?: string },
): ProtectedTopic {
  const term = (text: string, strength: RelatedTerm['strength']): RelatedTerm => ({
    text,
    level: 'common',
    strength,
    language: terms.language ?? 'en',
    addedBy: 'user',
  });
  return {
    id: name.toLowerCase().replaceAll(' ', '-'),
    name,
    enabled: true,
    pausedUntil: null,
    sources: { wiki: null, subreddit: null },
    lastRefresh: null,
    terms: [
      ...(terms.strong ?? []).map((text) => term(text, 'strong')),
      ...(terms.weak ?? []).map((text) => term(text, 'weak')),
    ],
  };
}

export function stateWithTopics(...topics: ProtectedTopic[]): ProtectionState {
  return { ...initialProtectionState(), topics };
}
