import { describe, expect, it } from 'vitest';
import { gta6, stateWithTopics } from '@/test/state';
import { GTA6_PRESET } from './state';
import {
  addTopic,
  addUserTerm,
  removeUserTerm,
  setUserTermCommonWord,
  TermTextError,
  topicNameWarning,
  userTermHint,
  userTerms,
} from './topics';

describe('warning about a Protected Topic named with an everyday word', () => {
  it.each(['Control', 'up', 'It', 'Inside', 'Lost', 'Jason', 'Mundo', 'ÉXITO'])(
    'warns for "%s", which would hide anything using the word',
    (name) => {
      expect(topicNameWarning(name)).toMatch(/everyday word/);
    },
  );

  it.each(['Go', 'X', '1917'])('warns for "%s", which is too short or only a number', (name) => {
    expect(topicNameWarning(name)).not.toBeNull();
  });

  it.each(['Severance', 'Leonida', 'Minecraft', 'GTA 6', 'The Last of Us', 'Grand Theft Auto VI'])(
    "doesn't warn for \"%s\"",
    (name) => {
      expect(topicNameWarning(name)).toBeNull();
    },
  );
});

describe('hint to mark your own term as a common word', () => {
  it.each(['Mark', 'Milk', 'Go', '42'])('suggests it for "%s"', (text) => {
    expect(userTermHint(text, 'Severance')).toMatch(/common word/);
  });

  it.each(['Lumon', 'Helly', 'Mark S', 'Kier Eagan'])("doesn't suggest it for \"%s\"", (text) => {
    expect(userTermHint(text, 'Severance')).toBeNull();
  });
});

const severance = () => addTopic(stateWithTopics(), 'Severance');

describe('storing your own Related Terms', () => {
  it('stores a term you add as Strong, marked as added by you', () => {
    const state = addUserTerm(severance(), 'severance', '  Lumon ');

    expect(state.topics[0]!.terms).toEqual([
      { text: 'Lumon', level: 'common', strength: 'strong', language: 'und', addedBy: 'user' },
    ]);
  });

  it('stores a term marked as a common word as Weak, and can change it back', () => {
    const weak = addUserTerm(severance(), 'severance', 'Mark', { commonWord: true });
    expect(weak.topics[0]!.terms[0]).toMatchObject({ text: 'Mark', strength: 'weak' });

    const strong = setUserTermCommonWord(weak, 'severance', 'Mark', false);
    expect(strong.topics[0]!.terms[0]).toMatchObject({ text: 'Mark', strength: 'strong' });
  });

  it('keeps your term apart from the AI’s copy of the same word', () => {
    const state = addUserTerm(stateWithTopics(gta6()), GTA6_PRESET.id, 'Jason');

    expect(state.topics[0]!.terms.filter((term) => term.text === 'Jason')).toEqual([
      expect.objectContaining({ strength: 'weak', addedBy: 'ai' }),
      expect.objectContaining({ strength: 'strong', addedBy: 'user' }),
    ]);
  });

  it('lists only your own terms, in the order you added them', () => {
    let state = stateWithTopics(gta6());
    state = addUserTerm(state, GTA6_PRESET.id, 'Lucia');
    state = addUserTerm(state, GTA6_PRESET.id, 'Port Gellhorn');

    expect(userTerms(state.topics[0]!).map((term) => term.text)).toEqual(['Lucia', 'Port Gellhorn']);
  });

  it('removes and changes only your own copy of a term, never the AI’s', () => {
    let state = addUserTerm(stateWithTopics(gta6()), GTA6_PRESET.id, 'jason', { commonWord: true });
    state = setUserTermCommonWord(state, GTA6_PRESET.id, 'JASON', false);
    expect(state.topics[0]!.terms.filter((term) => term.text === 'Jason')).toEqual([
      expect.objectContaining({ strength: 'weak', addedBy: 'ai' }),
    ]);

    state = removeUserTerm(state, GTA6_PRESET.id, 'Jason');

    expect(state.topics[0]!.terms).toEqual(GTA6_PRESET.terms);
  });

  it.each([
    ['', /Type/],
    ['  !! ', /Type/],
    ['lumon', /already/],
    ['#Lumon', /already/],
    ['severance', /name/],
  ])('refuses "%s"', (text, message) => {
    const state = addUserTerm(severance(), 'severance', 'Lumon');

    expect(() => addUserTerm(state, 'severance', text)).toThrow(TermTextError);
    expect(() => addUserTerm(state, 'severance', text)).toThrow(message);
  });
});
