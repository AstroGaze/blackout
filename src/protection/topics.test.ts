import { describe, expect, it } from 'vitest';
import { gta6, stateWithTopics } from '@/test/state';
import { GTA6_PRESET } from './state';
import {
  addMissingPresetTerms,
  addTopic,
  addUserTerm,
  aiTermsByLevel,
  removeUserTerm,
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

  it('stores a term marked as a common word as Weak', () => {
    const state = addUserTerm(severance(), 'severance', 'Mark', { commonWord: true });

    expect(state.topics[0]!.terms[0]).toMatchObject({ text: 'Mark', strength: 'weak', addedBy: 'user' });
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

  it('removes only your own copy of a term, never the AI’s', () => {
    let state = addUserTerm(stateWithTopics(gta6()), GTA6_PRESET.id, 'jason');

    state = removeUserTerm(state, GTA6_PRESET.id, 'JASON');

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

describe('bringing the ready-made GTA 6 topic up to date after an update', () => {
  it('adds the preset terms it is missing, and keeps everything it has', () => {
    const stored = gta6();
    stored.terms = stored.terms.filter((term) => term.text !== 'Grand Theft Auto 6');
    stored.terms.push({ text: 'Rockstar’s new game', level: 'common', strength: 'strong', language: 'en', addedBy: 'user' });
    stored.enabled = false;

    const [updated] = addMissingPresetTerms(stateWithTopics(stored)).topics;

    expect(updated!.terms.map((term) => term.text)).toEqual(
      expect.arrayContaining(['Grand Theft Auto 6', 'Rockstar’s new game', 'GTA 6']),
    );
    expect(updated!.terms).toHaveLength(GTA6_PRESET.terms.length + 1);
    expect(updated!.enabled).toBe(false);
  });

  it('leaves a deleted preset deleted', () => {
    expect(addMissingPresetTerms(stateWithTopics()).topics).toEqual([]);
  });
});

describe('Related Terms grouped by Spoiler Level for the term viewer', () => {
  it('puts the GTA 6 preset’s seeded terms under their levels', () => {
    const levels = aiTermsByLevel(gta6());

    expect(levels.common.map((term) => term.text)).toEqual([
      'GTA 6',
      'GTA VI',
      'Grand Theft Auto VI',
      'Grand Theft Auto 6',
      '#GTA6',
      'Leonida',
      'Jason',
      'Lucia',
      'Vice City',
    ]);
    expect([levels.minor, levels.major]).toEqual([[], []]);
  });

  it('leaves out your own terms, which are listed openly elsewhere', () => {
    const state = addUserTerm(stateWithTopics(gta6()), GTA6_PRESET.id, 'Port Gellhorn');

    expect(aiTermsByLevel(state.topics[0]!).common.map((term) => term.text)).not.toContain('Port Gellhorn');
  });

  it('puts a term whose Spoiler Level is missing or unknown under Major', () => {
    const topic = gta6();
    topic.terms = [
      { ...topic.terms[0]!, text: 'Cal Hampton', level: 'minor' },
      { ...topic.terms[0]!, text: 'Brian Heder', level: undefined as never },
      { ...topic.terms[0]!, text: 'Boobie Ike', level: 'huge' as never },
    ];

    const levels = aiTermsByLevel(topic);

    expect(levels.minor.map((term) => term.text)).toEqual(['Cal Hampton']);
    expect(levels.major.map((term) => term.text)).toEqual(['Brian Heder', 'Boobie Ike']);
  });
});
