import { describe, expect, it } from 'vitest';
import type { AttackRoll } from './attack.ts';
import { evaded, evadeResult, negateEffect, poolReactions, veiled } from './pool-reactions.ts';
import type { CastResult } from './spells.ts';
import { spendPool } from './pools.ts';
import type { Token } from './token-schema.ts';
import { poolCaster, poolSheetOf } from './pool-class.fixtures.ts';

// Misdirection and the reactions built on it, and Phantom Step.

const side = (token: Token) => ({ token, sheet: poolSheetOf(token) });
const monster = (m: string) => side({ id: m, name: m, x: 0, y: 0, monster: m } as Token);
const ids = (level: number, attacker: string, when: 'hit' | 'save' = 'hit') =>
  poolReactions(side(poolCaster(level)), monster(attacker), when).map((r) => [r.feature.id, r.cost, r.extra]);

describe('pool reactions', () => {
  it('offers Misdirection from 2nd level for twice the attacker’s Mind Weight', () => {
    expect(ids(1, 'goblin')).toEqual([]);
    expect(ids(2, 'goblin')).toEqual([['misdirection', 1, 0]]);
  });

  it('offers Redirect and Unreal Self on top, paying Misdirection first', () => {
    expect(ids(18, 'goblin')).toEqual([
      ['misdirection', 1, 0],
      ['redirect', 1, 0.5],
      ['unreal-self', 1, 1.5],
    ]);
  });

  it('fools no mindless attacker, nor one with blindsight', () => {
    expect(ids(7, 'ochre-jelly')).toEqual([]);
    expect(ids(7, 'bat')).toEqual([]);
  });

  it('needs the Lucidity to pay', () => {
    const poor = side(spendPool(poolCaster(2), 15.5));
    expect(poolReactions(poor, monster('goblin'), 'hit')).toEqual([]);
  });

  it('steps out of a spell from 11th level', () => {
    expect(ids(11, 'goblin', 'save')).toEqual([['phantom-step', 1, 0]]);
    expect(evaded(9, true)).toBe(0);
    expect(evaded(9, false)).toBe(4);
  });
});

describe('a veiled attack', () => {
  const roll = {
    natural: 15,
    total: 19,
    hit: true,
    crit: false,
    damage: [{ type: 'slashing' }],
  } as unknown as AttackRoll;

  it('keeps the lower d20', () => {
    expect(veiled(roll, 5, 14)).toMatchObject({ natural: 5, total: 9, hit: false, damage: [] });
    expect(veiled(roll, 18, 14)).toMatchObject({ natural: 15, total: 19, hit: true });
  });
});

describe('what a pool reaction leaves', () => {
  it('gives back the damage stepped out of, never above the hit points before', () => {
    const fire = { roll: { formula: '8d6', terms: [], total: 24 }, type: 'fire', dealt: 24 } as const;
    const failed = {
      target: 'nyx',
      damage: 24,
      parts: [fire],
      hp: 76,
      save: { success: false },
    } as unknown as CastResult;
    expect(evadeResult(failed, 100)).toMatchObject({ damage: 12, hp: 88, parts: [{ dealt: 12 }] });
    const saved = { ...failed, damage: 12, hp: 88, save: { success: true } } as unknown as CastResult;
    expect(evadeResult(saved, 100)).toMatchObject({ damage: 0, hp: 100, parts: [{ dealt: 0 }] });
  });

  it('puts the negating feature’s effect on the attacker, aimed at the reactor', () => {
    const unreal = poolSheetOf(poolCaster(18)).features.find((f) => f.id === 'unreal-self')!;
    expect(negateEffect(unreal, 'nyx', 'orc')).toMatchObject({ name: 'Lost track', onlyFor: 'nyx', source: 'nyx' });
    const veil = poolSheetOf(poolCaster(18)).features.find((f) => f.id === 'misdirection')!;
    expect(negateEffect(veil, 'nyx', 'orc')).toBeUndefined();
  });
});
