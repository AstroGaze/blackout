import { describe, expect, it } from 'vitest';
import { topicNameWarning } from './topics';

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
