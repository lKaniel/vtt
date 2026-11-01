import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SystemRegistry, defaultEdition, editionIn, type SystemDefinition } from './index.ts';

const dice: SystemDefinition<{ id: string }> = {
  id: 'dice-only',
  name: 'Dice only',
  editions: [
    { id: 'classic', name: 'Classic' },
    { id: 'new', name: 'New' },
  ],
  tokenSchema: z.object({ id: z.string() }),
  actorSchema: z.object({ id: z.string() }),
  tokenIssues: () => [],
};

describe('a system', () => {
  it('plays its first edition unless told otherwise', () => {
    expect(defaultEdition(dice)).toBe('classic');
    expect(editionIn(dice, 'new')).toBe('new');
    expect(editionIn(dice, undefined)).toBe('classic');
    expect(editionIn(dice, 'missing')).toBe('classic');
  });
});

describe('the systems a server has', () => {
  it('finds a system by id and lists what the lobby shows', () => {
    const systems = new SystemRegistry([dice]);
    expect(systems.get('dice-only')).toBe(dice);
    expect(systems.get('gurps')).toBeUndefined();
    expect(systems.infos()).toEqual([{ id: 'dice-only', name: 'Dice only', editions: dice.editions }]);
  });

  it('refuses two systems with one id', () => {
    expect(() => new SystemRegistry([dice, dice])).toThrow('dice-only');
  });

  it('names the system a game needs when the server lacks it', () => {
    expect(() => new SystemRegistry([dice]).require('gurps')).toThrow('gurps');
  });
});
