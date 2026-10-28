import { normalize } from '@/matcher/matcher';
import { isPaused, protectionState, type ProtectedTopic, type ProtectionState } from './state';

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
