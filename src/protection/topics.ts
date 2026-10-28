import { normalize } from '@/matcher/matcher';
import { COMMON_WORDS_BY_LANGUAGE } from './common-words';
import {
  isPaused,
  protectionState,
  type ProtectedTopic,
  type ProtectionState,
  type RelatedTerm,
} from './state';

const MINUTE = 60 * 1000;

/** The Pause lengths the popup and settings page offer. */
export const PAUSE_DURATIONS = [
  { label: '15 minutes', ms: 15 * MINUTE },
  { label: '1 hour', ms: 60 * MINUTE },
  { label: '4 hours', ms: 4 * 60 * MINUTE },
  { label: '1 day', ms: 24 * 60 * MINUTE },
] as const;

export type TopicStatus = 'on' | 'paused' | 'off';

export function topicStatus(topic: ProtectedTopic, now = Date.now()): TopicStatus {
  if (topic.enabled === false) return 'off';
  return isPaused(topic, now) ? 'paused' : 'on';
}

let commonWords: ReadonlySet<string> | null = null;

function isCommonWord(word: string): boolean {
  commonWords ??= new Set(COMMON_WORDS_BY_LANGUAGE.flatMap((list) => list.split(' ').map(normalize)));
  return commonWords.has(word);
}

/**
 * A topic's name protects on its own as a Strong Term, so a name that is a single
 * everyday word, a very short word or a plain number hides far more than the topic.
 * Returns a warning worded for the person typing it, or null when the name is
 * specific enough.
 */
export function topicNameWarning(name: string): string | null {
  const kind = broadWordKind(name);
  if (kind === null) return null;
  const shown = name.trim();
  const fuller = 'A fuller name, such as its complete title, hides less.';
  if (kind === 'everyday') {
    return `“${shown}” is an everyday word, so Blackout will hide anything that uses it, not just ${shown}. ${fuller}`;
  }
  return `“${shown}” is very short, so Blackout will hide anything that contains it as a word, not just ${shown}. ${fuller}`;
}

/**
 * The user's own terms are Strong unless marked as a common word, so a term that
 * is a single everyday word, a very short word or a plain number hides far more
 * than the topic. Returns a hint to mark it as a common word, or null.
 */
export function userTermHint(text: string, topicName: string): string | null {
  const kind = broadWordKind(text);
  if (kind === null) return null;
  const shown = text.trim();
  const what = kind === 'everyday' ? 'an everyday word' : 'very short';
  return `“${shown}” is ${what}. Mark it as a common word so it only hides alongside ${topicName} or its other terms.`;
}

/** Whether `text` is a single word that, on its own, hides far more than one topic. */
function broadWordKind(text: string): 'everyday' | 'short' | null {
  const words = normalize(text).split(' ').filter(Boolean);
  if (words.length !== 1) return null;
  const word = words[0]!;
  if (isCommonWord(word)) return 'everyday';
  if (word.length <= 2 || /^\d+$/.test(word)) return 'short';
  return null;
}

/** Why a name can't become a Protected Topic, worded for the person typing it. */
export class TopicNameError extends Error {}

/**
 * Adds a Protected Topic by its name alone. The name protects on its own, as a
 * Strong Term with its spacing and hashtag variants, until Related Terms arrive.
 */
export function addTopic(state: ProtectionState, name: string): ProtectionState {
  const trimmed = name.trim();
  if (normalize(trimmed) === '') throw new TopicNameError('Type the name of what you want to protect.');
  if (state.topics.some((topic) => normalize(topic.name) === normalize(trimmed))) {
    throw new TopicNameError(`${trimmed} is already protected.`);
  }
  const topic: ProtectedTopic = {
    id: uniqueId(state, trimmed),
    name: trimmed,
    enabled: true,
    pausedUntil: null,
    sources: { wiki: null, subreddit: null },
    lastRefresh: null,
    terms: [],
  };
  return { ...state, topics: [...state.topics, topic] };
}

function uniqueId(state: ProtectionState, name: string): string {
  const base = normalize(name).replaceAll(' ', '-') || 'topic';
  const taken = new Set(state.topics.map((topic) => topic.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

function changeTopic(
  state: ProtectionState,
  id: string,
  change: (topic: ProtectedTopic) => ProtectedTopic,
): ProtectionState {
  return { ...state, topics: state.topics.map((topic) => (topic.id === id ? change(topic) : topic)) };
}

/** Switches a topic on or off. Switching it on also ends any Pause. */
export function setTopicEnabled(state: ProtectionState, id: string, enabled: boolean): ProtectionState {
  return changeTopic(state, id, (topic) => ({ ...topic, enabled, pausedUntil: null }));
}

/** Pauses a topic until `until` (epoch ms); it switches back on by itself then. */
export function pauseTopic(state: ProtectionState, id: string, until: number): ProtectionState {
  return changeTopic(state, id, (topic) => ({ ...topic, enabled: true, pausedUntil: until }));
}

export function resumeTopic(state: ProtectionState, id: string): ProtectionState {
  return changeTopic(state, id, (topic) => ({ ...topic, pausedUntil: null }));
}

export function deleteTopic(state: ProtectionState, id: string): ProtectionState {
  return { ...state, topics: state.topics.filter((topic) => topic.id !== id) };
}

/** Why a term can't be added, worded for the person typing it. */
export class TermTextError extends Error {}

/**
 * The topic's terms the user added, in the order they added them. They are kept
 * apart from AI-added ones, even for the same word, so a refresh never touches them.
 */
export function userTerms(topic: ProtectedTopic): RelatedTerm[] {
  return topic.terms.filter((term) => term.addedBy === 'user');
}

/** A term's run-together form: the matcher reads "#Lumon" and "Lu mon" as "Lumon" too. */
function joinedForm(text: string): string {
  return normalize(text).replaceAll(' ', '');
}

/** Whether `term` is the user's own copy of `text`, compared as the matcher reads it. */
function isUserTerm(term: RelatedTerm, text: string): boolean {
  return term.addedBy === 'user' && joinedForm(term.text) === joinedForm(text);
}

/**
 * Adds the user's own Related Term to a topic. It is Strong unless marked as a
 * common word, which makes it Weak.
 */
export function addUserTerm(
  state: ProtectionState,
  topicId: string,
  text: string,
  { commonWord = false } = {},
): ProtectionState {
  const trimmed = text.trim();
  if (normalize(trimmed) === '') throw new TermTextError('Type a word or phrase to hide.');
  return changeTopic(state, topicId, (topic) => {
    if (joinedForm(topic.name) === joinedForm(trimmed)) {
      throw new TermTextError(`${topic.name} is already protected by its name.`);
    }
    const existing = topic.terms.find((term) => isUserTerm(term, trimmed));
    if (existing) throw new TermTextError(`${existing.text} is already one of your terms.`);
    const term: RelatedTerm = {
      text: trimmed,
      // Spoiler Levels rate what the AI found; the user already knows their own terms.
      // The term viewer and its counts show AI-added terms only.
      level: 'common',
      strength: commonWord ? 'weak' : 'strong',
      // Typed by the user, in whatever language they wrote it.
      language: 'und',
      addedBy: 'user',
    };
    return { ...topic, terms: [...topic.terms, term] };
  });
}

/** Marks one of the user's terms as a common word (Weak) or not (Strong). */
export function setUserTermCommonWord(
  state: ProtectionState,
  topicId: string,
  text: string,
  commonWord: boolean,
): ProtectionState {
  return changeTopic(state, topicId, (topic) => ({
    ...topic,
    terms: topic.terms.map((term) =>
      isUserTerm(term, text) ? { ...term, strength: commonWord ? 'weak' : 'strong' } : term,
    ),
  }));
}

/** Removes one of the user's terms. An AI-added copy of the same word stays. */
export function removeUserTerm(state: ProtectionState, topicId: string, text: string): ProtectionState {
  return changeTopic(state, topicId, (topic) => ({
    ...topic,
    terms: topic.terms.filter((term) => !isUserTerm(term, text)),
  }));
}

/** Changes made from this page, one after another so none overwrites another. */
let pendingChanges: Promise<unknown> = Promise.resolve();

/**
 * Reads the protection state, changes it and stores it; open pages react to the
 * change. Returns the new state.
 */
export function updateProtection(
  change: (state: ProtectionState) => ProtectionState,
): Promise<ProtectionState> {
  const update = pendingChanges.then(async () => {
    const next = change(await protectionState.getValue());
    await protectionState.setValue(next);
    return next;
  });
  pendingChanges = update.catch(() => {});
  return update;
}
