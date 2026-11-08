import { describe, expect, it } from 'vitest';
import { WeightSchema, PoolSchema } from './power-schema.ts';
import { addHold, poolLeft, poolSheet, releaseHold, restPool, spendPool, weightOf } from './pools.ts';
import type { Token } from './token-schema.ts';
import { AbilitiesSchema } from './stats-schema.ts';

// A homebrew class's point pool (Lucidity): its size by level, what's spent,
// what lasting uses hold back, and creature weights costs count in.

const mind = WeightSchema.parse({
  name: 'Mind Weight',
  tiers: [
    [0, 1],
    [1, 2],
    [4, 3],
    [8, 5],
    [13, 8],
    [18, 12],
  ],
  ability: 'wis',
  base: 0.75,
  per: 0.25,
  min: 0.25,
});

const lucidity = PoolSchema.parse({
  id: 'lucidity',
  name: 'Lucidity',
  ability: 'wis',
  recharge: 'short',
  concurrent: 0.5,
  max: [
    [1, 12],
    [2, 16],
    [3, 20],
  ],
  weight: mind,
  reserveTimes: [
    [1, 1],
    [9, 0.5],
  ],
});

const abilities = (wis: number) => AbilitiesSchema.parse({ wis });
const token = (over: Partial<Token> = {}): Token => ({ id: 'nyx', name: 'Nyx', x: 0, y: 0, ...over }) as Token;

describe('weights', () => {
  it('is the tier of the rank times the ability multiplier', () => {
    expect(weightOf(mind, 0.25, abilities(8))).toBe(0.5); // a goblin
    expect(weightOf(mind, 0.5, abilities(11))).toBe(0.75); // an orc
    expect(weightOf(mind, 3, abilities(12))).toBe(2); // a 3rd-level character
    expect(weightOf(mind, 20, abilities(20))).toBe(24);
  });

  it('never drops below its minimum', () => {
    expect(weightOf(mind, 0, abilities(1))).toBe(0.25);
  });
});

describe('a pool', () => {
  const basics = { abilities: abilities(16), proficiency: 2 };

  it('is full at its level, with half of it for lasting uses', () => {
    const sheet = poolSheet(token(), { pool: lucidity, level: 2 }, basics);
    expect(sheet).toMatchObject({ name: 'Lucidity', max: 16, left: 16, concurrent: { max: 8, held: 0 } });
    expect(sheet).toMatchObject({ dc: 13, attack: 5, mod: 3 });
  });

  it('spends points and gets them back on a rest', () => {
    const spent = spendPool(token(), 5);
    expect(poolSheet(spent, { pool: lucidity, level: 1 }, basics).left).toBe(7);
    expect(restPool(spent, lucidity, 'short').spent?.pool).toBeUndefined();
    expect(restPool(spent, { ...lucidity, recharge: 'long' }, 'short').spent?.pool).toBe(5);
  });

  it('holds lasting uses against the concurrent share, not the pool', () => {
    const held = addHold(spendPool(token(), 3), { id: 'weave-1', feature: 'weave', name: 'Weave', cost: 3 });
    const sheet = poolSheet(held, { pool: lucidity, level: 1 }, basics);
    expect(sheet.left).toBe(9);
    expect(sheet.concurrent).toEqual({ max: 6, held: 3 });
    const freed = releaseHold(held, 'weave-1');
    expect(poolSheet(freed, { pool: lucidity, level: 1 }, basics).concurrent?.held).toBe(0);
  });

  it('lowers both maximums for reserved uses, and the current value only above the new maximum', () => {
    const glamour = { id: 'glamour-1', feature: 'glamour', name: 'Glamour', cost: 4, reserve: true };
    const full = poolSheet(addHold(token(), glamour), { pool: lucidity, level: 1 }, basics);
    expect(full).toMatchObject({ max: 8, left: 8, reserved: 4, concurrent: { max: 2, held: 0 } });
    const low = poolSheet(addHold(spendPool(token(), 10), glamour), { pool: lucidity, level: 1 }, basics);
    expect(low.left).toBe(2);
  });

  it('reserves only part of the cost from a level (steady glamour)', () => {
    const glamour = { id: 'glamour-1', feature: 'glamour', name: 'Glamour', cost: 4, reserve: true };
    const deep = {
      ...lucidity,
      max: [
        [1, 12],
        [9, 120],
      ] as [number, number][],
    };
    expect(poolSheet(addHold(token(), glamour), { pool: deep, level: 9 }, basics).reserved).toBe(2);
  });

  it('says what is left', () => {
    expect(poolLeft({ max: 10, left: 4, reserved: 0, concurrent: { max: 5, held: 4 } })).toEqual({ pool: 4, held: 1 });
  });
});
