import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { counterers, counterOutcome } from './counterspell.ts';
import { resolveCreature } from './creature.ts';
import { castProblem } from './spells.ts';
import { type Token, TokenSchema } from './token-schema.ts';
import type { Edition } from './stats-schema.ts';

// Counterspell: an enemy caster within 60 ft may answer a spell being cast.

const wizard = (patch: Partial<Token> = {}, level = 9) =>
  TokenSchema.parse({
    id: 'wiz',
    name: 'Wizard',
    x: 50,
    y: 50,
    ownership: { default: 'none' },
    stats: { class: 'wizard', level, abilities: { int: 18, con: 10 }, spells: ['counterspell', 'fireball'] },
    ...patch,
  });
const hero = (patch: Partial<Token> = {}) =>
  wizard({ id: 'hero', name: 'Hero', x: 450, ownership: { default: 'limited', ana: 'owner' }, ...patch });
const side = (token: Token, edition: Edition = '2014') => ({
  token,
  sheet: resolveCreature(token, srdFor(edition))!,
});
const spell = (id: string, edition: Edition = '2014') => srdFor(edition).spells.get(id)!;

describe('who may counter', () => {
  const others = (...tokens: Token[]) => tokens.map((t) => side(t));
  const find = (tokens: Token[], reacted: string[] = []) =>
    counterers({ caster: side(hero()), others: others(...tokens), reacted, gridSize: 100 }).map((c) => c.token.id);

  it('an enemy within 60 ft who knows it and has a 3rd-level slot', () => {
    expect(find([wizard()])).toEqual(['wiz']);
  });

  it('not a friend, one too far, one that already reacted, or one with no slot for it', () => {
    expect(find([wizard({ ownership: { default: 'limited', bo: 'owner' } })])).toEqual([]);
    expect(find([wizard({ x: 1850 })])).toEqual([]);
    expect(find([wizard()], ['wiz'])).toEqual([]);
    expect(find([wizard({}, 4)])).toEqual([]);
  });

  it('cannot be cast from the spell bar', () => {
    expect(castProblem({ spell: spell('counterspell'), slot: 3, sheet: side(wizard()).sheet })).toMatch(/reaction/);
  });
});

describe('2014', () => {
  const by = side(wizard());
  const of = side(hero());

  it('stops a spell of the slot it was cast with or lower', () => {
    expect(counterOutcome({ by, of, slot: 3, level: 3 }, () => 0)).toMatchObject({ countered: true });
    expect(counterOutcome({ by, of, slot: 5, level: 5 }, () => 0)).toMatchObject({ countered: true });
  });

  it('a higher spell needs a spellcasting check against 10 + its level', () => {
    const high = counterOutcome({ by, of, slot: 3, level: 5 }, () => 0.99);
    expect(high).toMatchObject({ countered: true, check: { dc: 15 } });
    expect(counterOutcome({ by, of, slot: 3, level: 5 }, () => 0).countered).toBe(false);
  });
});

describe('2024', () => {
  const by = side(wizard(), '2024');
  const of = side(hero(), '2024');

  it('the caster saves with Constitution; on a failure the spell fails and its slot is kept', () => {
    const failed = counterOutcome({ by, of, slot: 3, level: 5 }, () => 0);
    expect(failed).toMatchObject({
      countered: true,
      keepsSlot: true,
      save: { ability: 'con', dc: by.sheet.caster!.dc },
    });
    expect(counterOutcome({ by, of, slot: 3, level: 1 }, () => 0.99).countered).toBe(false);
  });
});
