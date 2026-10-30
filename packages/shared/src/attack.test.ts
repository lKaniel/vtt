import { describe, expect, it } from 'vitest';
import {
  applyDamage,
  attackRange,
  critDice,
  rollAttack,
  tokenDistance,
  type Attack,
  type Creature,
  type Rng,
} from './index.ts';

/** An rng that returns the given d20 faces (and then 1s) in order. */
function d20s(...faces: number[]): Rng {
  const queue = faces.map((f) => (f - 1) / 20);
  return () => queue.shift() ?? 0;
}

const sword: Attack = {
  name: 'Sword',
  kind: 'melee',
  toHit: 5,
  reach: 5,
  damage: [{ dice: '1d8+3', type: 'slashing' }],
};
const bow: Attack = {
  name: 'Bow',
  kind: 'ranged',
  toHit: 5,
  range: [80, 320],
  damage: [{ dice: '1d8', type: 'piercing' }],
};

const target = (over: Partial<Creature> = {}): Creature => ({
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  proficiency: 2,
  ac: 15,
  hp: 20,
  maxHp: 20,
  speed: 30,
  initiative: 0,
  attacks: [],
  resistances: [],
  immunities: [],
  vulnerabilities: [],
  type: 'humanoid',
  attacksPerAction: 1,
  weaponMastery: false,
  features: [],
  effects: [],
  conditions: [],
  saves: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
  ...over,
});

describe('critDice', () => {
  it('doubles the dice but not the modifier', () => {
    expect(critDice('1d8+3')).toBe('2d8+3');
    expect(critDice('2d6 + 1d4 - 1')).toBe('4d6+2d4-1');
    expect(critDice('3')).toBe('3');
  });
});

describe('rollAttack', () => {
  it('hits when d20 + bonus meets the AC', () => {
    const r = rollAttack(sword, target(), {}, d20s(10));
    expect(r).toMatchObject({ total: 15, hit: true, crit: false });
    expect(r.damage[0]!.roll.formula).toBe('1d8+3');
  });

  it('misses below the AC and rolls no damage', () => {
    expect(rollAttack(sword, target(), {}, d20s(9))).toMatchObject({ hit: false, damage: [] });
  });

  it('always hits on a 20 and crits, always misses on a 1', () => {
    const crit = rollAttack(sword, target({ ac: 30 }), {}, d20s(20));
    expect(crit).toMatchObject({ hit: true, crit: true });
    expect(crit.damage[0]!.roll.formula).toBe('2d8+3');
    expect(rollAttack(sword, target({ ac: 1 }), {}, d20s(1))).toMatchObject({ hit: false });
  });

  it('keeps the higher d20 with advantage and the lower with disadvantage', () => {
    expect(rollAttack(sword, target(), { advantage: true }, d20s(3, 12)).natural).toBe(12);
    expect(rollAttack(sword, target(), { disadvantage: true }, d20s(3, 12)).natural).toBe(3);
    expect(rollAttack(sword, target(), { advantage: true, disadvantage: true }, d20s(3, 12)).natural).toBe(3);
  });
});

describe('rollAttack with effects', () => {
  it('adds bonus dice like bless to the roll', () => {
    // d20 of 9, +5, and the d4 also reads the next value: a 1.
    const r = rollAttack(sword, target(), { bonus: ['1d4'] }, d20s(9));
    expect(r).toMatchObject({ total: 15, hit: true });
  });

  it('turns a hit into a crit when the target is helpless', () => {
    expect(rollAttack(sword, target(), { autoCrit: true }, d20s(12))).toMatchObject({ hit: true, crit: true });
    expect(rollAttack(sword, target(), { autoCrit: true }, d20s(2))).toMatchObject({ hit: false, crit: false });
  });

  it('rolls extra damage on a hit, doubled on a crit', () => {
    const extra = [{ dice: '1d6', type: 'piercing' as const }];
    expect(rollAttack(sword, target(), { extraDamage: extra }, d20s(12)).damage.map((d) => d.roll.formula)).toEqual([
      '1d8+3',
      '1d6',
    ]);
    expect(rollAttack(sword, target(), { extraDamage: extra }, d20s(20)).damage[1]!.roll.formula).toBe('2d6');
  });
});

describe('applyDamage', () => {
  it('halves resisted damage, doubles vulnerable damage, ignores immune damage', () => {
    const t = target({ resistances: ['fire'], vulnerabilities: ['bludgeoning'], immunities: ['poison'] });
    expect(applyDamage(t, [{ amount: 7, type: 'fire' }])).toMatchObject({ dealt: [3], hp: 17 });
    expect(applyDamage(t, [{ amount: 4, type: 'bludgeoning' }])).toMatchObject({ dealt: [8], hp: 12 });
    expect(applyDamage(t, [{ amount: 9, type: 'poison' }])).toMatchObject({ dealt: [0], hp: 20 });
  });

  it('never goes below 0 hp', () => {
    expect(applyDamage(target({ hp: 5 }), [{ amount: 12, type: 'slashing' }]).hp).toBe(0);
  });
});

describe('distance and range', () => {
  const G = 100;
  const at = (col: number, row: number, size = 1) => ({ x: (col + size / 2) * G, y: (row + size / 2) * G, size });

  it('measures 5 ft between neighbours and counts diagonals as 5 ft', () => {
    expect(tokenDistance(at(0, 0), at(1, 0), G)).toBe(5);
    expect(tokenDistance(at(0, 0), at(1, 1), G)).toBe(5);
    expect(tokenDistance(at(0, 0), at(3, 2), G)).toBe(15);
  });

  it('measures from the nearest square of a large creature', () => {
    expect(tokenDistance(at(0, 0), at(1, 0, 2), G)).toBe(5);
    expect(tokenDistance(at(0, 0), at(3, 0, 2), G)).toBe(15);
  });

  it('allows melee within reach and ranged out to long range with disadvantage', () => {
    expect(attackRange(sword, 5)).toBe('normal');
    expect(attackRange(sword, 10)).toBe('out');
    expect(attackRange(bow, 80)).toBe('normal');
    expect(attackRange(bow, 85)).toBe('long');
    expect(attackRange(bow, 325)).toBe('out');
  });
});
