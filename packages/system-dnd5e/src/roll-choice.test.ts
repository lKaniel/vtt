import { describe, expect, it } from 'vitest';
import type { Rng } from '@vtt/shared';
import { rollAttack } from './attack.ts';
import { rollCheck } from './checks.ts';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { chosenCrit, withEdge } from './roll-choice.ts';
import { resolveCast } from './spells.ts';
import { type Token, TokenSchema } from './token-schema.ts';
import type { Attack } from './stats-schema.ts';

// The roller's own pick for one roll: advantage or disadvantage on the d20,
// and a critical hit forced or held back on the damage.

const book = srdFor('2014');
const d20s = (...faces: number[]): Rng => {
  const queue = faces.map((f) => (f - 1) / 20 + 0.001);
  return () => queue.shift() ?? 0;
};
const side = (token: Token) => ({ token, sheet: resolveCreature(token, book)! });
const goblin = side(TokenSchema.parse({ id: 'g', name: 'Goblin', x: 150, y: 50, monster: 'goblin' }));
const sword: Attack = {
  name: 'Sword',
  kind: 'melee',
  toHit: 5,
  reach: 5,
  damage: [{ dice: '1d8+3', type: 'slashing' }],
};

describe('withEdge', () => {
  it('adds the pick to what the effects give, so one of each still cancels out', () => {
    expect(withEdge({ advantage: false, disadvantage: false }, 'advantage')).toEqual({
      advantage: true,
      disadvantage: false,
    });
    expect(withEdge({ advantage: false, disadvantage: true }, 'advantage')).toEqual({
      advantage: true,
      disadvantage: true,
    });
    expect(withEdge({ advantage: true, disadvantage: false }, undefined)).toEqual({
      advantage: true,
      disadvantage: false,
    });
  });
});

describe('chosenCrit', () => {
  it('forces or holds back a critical on a hit, and never makes a miss crit', () => {
    expect(chosenCrit({ hit: true, crit: false }, 'crit')).toBe(true);
    expect(chosenCrit({ hit: true, crit: true }, 'normal')).toBe(false);
    expect(chosenCrit({ hit: false, crit: false }, 'crit')).toBe(false);
    expect(chosenCrit({ hit: true, crit: true }, undefined)).toBe(true);
  });
});

describe('an attack rolled with a pick', () => {
  it('keeps the higher d20 with advantage and the lower with disadvantage', () => {
    expect(rollAttack(sword, goblin.sheet, { edge: 'advantage' }, d20s(3, 12)).natural).toBe(12);
    expect(rollAttack(sword, goblin.sheet, { edge: 'disadvantage' }, d20s(12, 3)).natural).toBe(3);
  });

  it('doubles the damage dice when a critical is forced on a hit', () => {
    const r = rollAttack(sword, goblin.sheet, { crit: 'crit' }, d20s(15));
    expect(r).toMatchObject({ hit: true, crit: true });
    expect(r.damage[0]!.roll.formula).toBe('2d8+3');
  });

  it('rolls normal damage on a natural 20 when the critical is held back', () => {
    const r = rollAttack(sword, goblin.sheet, { crit: 'normal' }, d20s(20));
    expect(r).toMatchObject({ hit: true, crit: false });
    expect(r.damage[0]!.roll.formula).toBe('1d8+3');
  });
});

describe('a check or save rolled with a pick', () => {
  const hero = TokenSchema.parse({ id: 'h', name: 'Hero', x: 0, y: 0, stats: { class: 'rogue', level: 5 } });
  const sheet = resolveCreature(hero, book)!;

  it('rolls two d20s', () => {
    expect(rollCheck(hero, sheet, { ability: 'dex', edge: 'advantage' }).roll?.formula).toMatch(/^2d20kh1/);
    expect(rollCheck(hero, sheet, { ability: 'wis', save: true, edge: 'disadvantage' }).roll?.formula).toMatch(
      /^2d20kl1/,
    );
  });
});

describe('a spell attack rolled with a pick', () => {
  const wizard = side(
    TokenSchema.parse({
      id: 'wiz',
      name: 'Wiz',
      x: 50,
      y: 50,
      stats: { class: 'wizard', level: 5, abilities: { int: 18 }, spells: ['fire-bolt'] },
    }),
  );
  const cast = (choice: Parameters<typeof resolveCast>[0]['pick'], rng: Rng) =>
    resolveCast(
      { spell: book.spells.get('fire-bolt')!, slot: 0, caster: wizard, targets: [goblin], gridSize: 100, pick: choice },
      rng,
    ).results[0]!;

  it('takes advantage and a forced critical', () => {
    const r = cast({ edge: 'advantage', crit: 'crit' }, d20s(2, 15));
    expect(r.attack?.formula).toMatch(/^2d20kh1/);
    expect(r).toMatchObject({ hit: true, crit: true });
  });
});
