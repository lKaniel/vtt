import { describe, expect, it } from 'vitest';
import { rest } from './features.ts';
import { addHold, spendPool } from './pools.ts';
import { poolCaster, poolSheetOf } from './pool-class.fixtures.ts';

// A creature of a pool class: its pool on the sheet, its rank, and rests.

describe('a creature with a pool', () => {
  it('has its pool and its features at its level', () => {
    const sheet = poolSheetOf(poolCaster(3));
    expect(sheet.pool).toMatchObject({ name: 'Lucidity', max: 20, left: 20, dc: 13, attack: 5 });
    expect(sheet.rank).toBe(3);
    const bolt = sheet.features.find((f) => f.id === 'bolt')!;
    expect(bolt.spell).toMatchObject({ damage: [{ dice: '1d10+3', type: 'psychic' }], damageTimes: 1.5 });
  });

  it('fills its pool again on a short rest', () => {
    const token = spendPool(poolCaster(1), 7);
    expect(poolSheetOf(token).pool?.left).toBe(5);
    expect(poolSheetOf(rest(token, poolSheetOf(token), 'short')).pool?.left).toBe(12);
  });

  it('keeps a reserved use and its effect through a long rest', () => {
    const glamour = { id: 'g1', feature: 'glamour', name: 'Glamour', cost: 2, reserve: true };
    const weave = { id: 'w1', feature: 'weave', name: 'Weave', cost: 2 };
    const token = {
      ...addHold(addHold(poolCaster(2), glamour), weave),
      effects: [
        { id: 'glamour-g1', name: 'Glamour', hold: 'g1', source: 'nyx' },
        { id: 'blur', name: 'Blur', source: 'nyx' },
      ],
    };
    const rested = rest(token, poolSheetOf(token), 'long');
    expect(rested.effects?.map((e) => e.id)).toEqual(['glamour-g1']);
    expect(rested.holds?.map((h) => h.id)).toEqual(['g1']);
    expect(poolSheetOf(rested).pool).toMatchObject({ max: 14, left: 14 });
  });

  it('gives monsters their challenge rating as rank', () => {
    const goblin = { id: 'g', name: 'Goblin', x: 0, y: 0, monster: 'goblin' } as never;
    expect(poolSheetOf(goblin).rank).toBe(0.25);
  });
});
