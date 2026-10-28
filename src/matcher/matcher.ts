import { isTopicActive, type BlockedSource, type ProtectedTopic, type ProtectionState, type SourceId } from '@/protection/state';

/** Why an item is hidden: it is about a Protected Topic, or it comes from a Blocked Source. */
export type HideReason =
  | { kind: 'topic'; topicId: string; topicName: string }
  | { kind: 'blockedSource'; source: BlockedSource };

export type Verdict = { hide: false } | { hide: true; reason: HideReason };

export interface CheckableItem {
  text: string;
  /** Topics the item's surroundings are about, such as the page it sits on. */
  contextTopicIds?: ReadonlySet<string>;
  /** The account that posted the item, when the site shows it. */
  source?: SourceId | null;
}

export interface Matcher {
  check(item: CheckableItem): Verdict;
}

/**
 * Scripts written without spaces between words. Each of their characters counts
 * as a word, so a term can match inside a run of text. The cost is that word
 * boundaries don't hold in these scripts: a term also matches inside longer words.
 */
const UNSPACED_SCRIPT_CHAR =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/gu;

/**
 * Reduces text to lowercase, unaccented words separated by single spaces, and
 * splits letters from digits so "GTA6", "#GTA6" and "GTA 6" all read "gta 6".
 */
export function normalize(text: string): string {
  return (
    text
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '')
      // Recompose what removing accents left apart, such as Korean syllables.
      .normalize('NFC')
      .toLowerCase()
      .replace(UNSPACED_SCRIPT_CHAR, ' $& ')
      .replace(/(\p{L})(?=\p{N})/gu, '$1 ')
      .replace(/(\p{N})(?=\p{L})/gu, '$1 ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  );
}

/** The normalised forms a term can take: as written, and run together as in a hashtag. */
function termPatterns(text: string): string[] {
  const spaced = normalize(text);
  if (spaced === '') return [];
  const joined = spaced.replaceAll(' ', '');
  // "gta 6" run together is "gta6", which normalised text never contains.
  return joined !== spaced && normalize(joined) === joined ? [spaced, joined] : [spaced];
}

interface CompiledTerm {
  topic: ProtectedTopic;
  strong: boolean;
}

/**
 * Compiles the protection state into a matcher, once per state change. Throws on
 * malformed state rather than quietly matching less.
 */
export function compileMatcher(state: ProtectionState, now = Date.now()): Matcher {
  const activeTopics: ProtectedTopic[] = [];
  const termsByPattern = new Map<string, Set<CompiledTerm>>();
  /** For each word a pattern can start with, the word counts of those patterns. */
  const patternLengthsByFirstWord = new Map<string, Set<number>>();

  for (const topic of state.topics) {
    if (typeof topic.name !== 'string') throw new Error('Malformed topic');
    if (!isTopicActive(topic, now)) continue;
    activeTopics.push(topic);
    /** The topic's terms by their run-together form, so spelling variants count once. */
    const termsByJoinedForm = new Map<string, CompiledTerm>();
    // The topic's name protects on its own, as a Strong Term.
    const nameTerm = { text: topic.name, strength: 'strong' } as const;
    for (const term of [nameTerm, ...topic.terms]) {
      if (typeof term.text !== 'string' || (term.strength !== 'strong' && term.strength !== 'weak')) {
        throw new Error(`Malformed term in topic "${topic.name}"`);
      }
      const patterns = termPatterns(term.text);
      const [spaced] = patterns;
      if (spaced === undefined) continue;
      const joinedForm = spaced.replaceAll(' ', '');
      const compiled = termsByJoinedForm.get(joinedForm) ?? { topic, strong: false };
      termsByJoinedForm.set(joinedForm, compiled);
      // The same term written twice: the stricter strength wins.
      if (term.strength === 'strong') compiled.strong = true;
      for (const pattern of patterns) {
        termsByPattern.set(pattern, (termsByPattern.get(pattern) ?? new Set()).add(compiled));
        const words = pattern.split(' ');
        const firstWord = words[0]!;
        const lengths = patternLengthsByFirstWord.get(firstWord) ?? new Set();
        patternLengthsByFirstWord.set(firstWord, lengths.add(words.length));
      }
    }
  }

  /** Blocked Sources by site and account. They apply while any topic is active. */
  const blockedSources = new Map<string, BlockedSource>();
  for (const source of state.blockedSources) {
    if (typeof source.site !== 'string' || typeof source.account !== 'string') throw new Error('Malformed Blocked Source');
    blockedSources.set(`${source.site} ${source.account}`, source);
  }

  return {
    check(item) {
      const blocked = item.source && activeTopics.length > 0 && blockedSources.get(`${item.source.site} ${item.source.account}`);
      if (blocked) return { hide: true, reason: { kind: 'blockedSource', source: blocked } };
      // Look for every term at every word, so overlapping terms of different topics all count.
      const words = normalize(item.text).split(' ');
      const matchedTermsByTopic = new Map<ProtectedTopic, Set<CompiledTerm>>();
      words.forEach((word, start) => {
        for (const length of patternLengthsByFirstWord.get(word) ?? []) {
          const candidate = words.slice(start, start + length).join(' ');
          for (const term of termsByPattern.get(candidate) ?? []) {
            const matched = matchedTermsByTopic.get(term.topic) ?? new Set();
            matchedTermsByTopic.set(term.topic, matched.add(term));
          }
        }
      });
      for (const topic of activeTopics) {
        const matched = matchedTermsByTopic.get(topic);
        if (!matched) continue;
        // A Strong Term hides on its own. A Weak Term needs another term of its
        // topic, or surroundings that are about the topic.
        if (
          matched.size > 1 ||
          [...matched].some((term) => term.strong) ||
          item.contextTopicIds?.has(topic.id)
        ) {
          return { hide: true, reason: { kind: 'topic', topicId: topic.id, topicName: topic.name } };
        }
      }
      return { hide: false };
    },
  };
}
