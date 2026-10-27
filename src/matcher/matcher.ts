import type { ProtectedTopic, ProtectionState } from '@/protection/state';

export interface HideReason {
  kind: 'topic';
  topicId: string;
  topicName: string;
}

export type Verdict = { hide: false } | { hide: true; reason: HideReason };

export interface CheckableItem {
  text: string;
}

export interface Matcher {
  check(item: CheckableItem): Verdict;
}

/**
 * Reduces text to lowercase, unaccented words separated by single spaces, and
 * splits letters from digits so "GTA6", "#GTA6" and "GTA 6" all read "gta 6".
 */
export function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/(\p{L})(?=\p{N})/gu, '$1 ')
    .replace(/(\p{N})(?=\p{L})/gu, '$1 ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** The normalised forms a term can take: as written, and run together as in a hashtag. */
function termPatterns(text: string): string[] {
  const spaced = normalize(text);
  if (spaced === '') return [];
  const joined = spaced.replaceAll(' ', '');
  // "gta 6" run together is "gta6", which normalised text never contains.
  return joined !== spaced && normalize(joined) === joined ? [spaced, joined] : [spaced];
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Compiles the protection state into a matcher, once per state change. Throws on
 * malformed state rather than quietly matching less.
 */
export function compileMatcher(state: ProtectionState): Matcher {
  const topicByPattern = new Map<string, ProtectedTopic>();
  for (const topic of state.topics) {
    if (typeof topic.name !== 'string') throw new Error('Malformed topic');
    for (const term of topic.terms) {
      if (typeof term.text !== 'string' || (term.strength !== 'strong' && term.strength !== 'weak')) {
        throw new Error(`Malformed term in topic "${topic.name}"`);
      }
      if (term.strength !== 'strong') continue;
      for (const pattern of termPatterns(term.text)) {
        if (!topicByPattern.has(pattern)) topicByPattern.set(pattern, topic);
      }
    }
  }

  if (topicByPattern.size === 0) return { check: () => ({ hide: false }) };

  // Longest first, so a longer term wins over a shorter one it contains.
  const alternatives = [...topicByPattern.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');
  // Whole words only: each match must be bounded by a space or the text's ends.
  const pattern = new RegExp(`(?<![^ ])(?:${alternatives})(?![^ ])`);

  return {
    check(item) {
      const match = pattern.exec(normalize(item.text));
      if (!match) return { hide: false };
      const topic = topicByPattern.get(match[0])!;
      return { hide: true, reason: { kind: 'topic', topicId: topic.id, topicName: topic.name } };
    },
  };
}
