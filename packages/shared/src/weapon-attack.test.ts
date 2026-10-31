import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { TokenSchema, type Token } from './schema.ts';
import type { Edition } from './stats-schema.ts';
import { resolveWeaponAttack } from './weapon-attack.ts';

const pc = (cls: string, rules: Edition, data: object = {}) =>
  TokenSchema.parse({
    id: 'pc',
    name: 'PC',
    x: 50,
    y: 50,
    stats: { class: cls, level: 3, rules, maxHp: 30, abilities: { str: 16, dex: 16 } },
    ...data,
  });
const ogre = (data: object = {}) =>
  TokenSchema.parse({ id: 'ogre', name: 'Ogre', x: 150, y: 50, monster: 'ogre', ...data });
const side = (t: Token) => ({ token: t, sheet: resolveCreature(t, srdFor(t.stats?.rules ?? '2014'))! });
const face = (n: number, sides: number) => (n - 1) / sides + 0.001;
const rngOf = (values: number[]) => () => values.shift() ?? 0.001;

function attack(attacker: Token, target: Token, opts: { name: string; rng: number[]; allyNear?: boolean }) {
  const a = side(attacker);
  return resolveWeaponAttack(
    {
      attacker: a,
      target: side(target),
      attack: a.sheet.attacks.find((x) => x.name === opts.name)!,
      range: 'normal',
      gridSize: 100,
      allyNearTarget: opts.allyNear ?? false,
      sneakUsed: false,
    },
    rngOf(opts.rng),
  );
}

describe('resolveWeaponAttack', () => {
  const rogue = pc('rogue', '2014', { inventory: [{ item: 'rapier', equipped: true }] });

  it('adds sneak attack when an ally is next to the target', () => {
    const out = attack(rogue, ogre(), { name: 'Rapier', rng: [face(15, 20)], allyNear: true });
    expect(out.sneak).toBe(true);
    expect(out.roll.damage.map((d) => d.roll.formula)).toEqual(['1d8+3', '2d6']);
  });

  it('adds no sneak attack without advantage or an ally', () => {
    const out = attack(rogue, ogre(), { name: 'Rapier', rng: [face(15, 20)] });
    expect(out.sneak).toBe(false);
  });

  it('adds rage damage to strength melee attacks', () => {
    const barbarian = pc('barbarian', '2014', {
      inventory: [{ item: 'greataxe', equipped: true }],
      effects: [{ id: 'rage', name: 'Rage', meleeDamage: 2 }],
    });
    const out = attack(barbarian, ogre(), { name: 'Greataxe', rng: [face(15, 20)] });
    expect(out.roll.damage.map((d) => d.roll.formula)).toEqual(['1d12+3', '2']);
  });

  it('attacks a paralyzed target next to you with advantage and crits on a hit', () => {
    const held = ogre({ effects: [{ id: 'h', name: 'Held', conditions: ['paralyzed'] }] });
    const out = attack(pc('fighter', '2014', { inventory: [{ item: 'longsword', equipped: true }] }), held, {
      name: 'Longsword',
      rng: [face(5, 20), face(10, 20)],
    });
    expect(out.roll).toMatchObject({ hit: true, crit: true });
  });

  describe('weapon mastery, 2024 only', () => {
    const sword = { inventory: [{ item: 'longsword', equipped: true }] };

    it('saps the target of a 2024 fighter', () => {
      const out = attack(pc('fighter', '2024', sword), ogre(), { name: 'Longsword', rng: [face(15, 20)] });
      expect(out.targetEffects).toEqual([
        expect.objectContaining({ name: 'Sapped', disadvantage: true, once: true, source: 'pc' }),
      ]);
    });

    it('does nothing for a 2014 fighter', () => {
      const out = attack(pc('fighter', '2014', sword), ogre(), { name: 'Longsword', rng: [face(15, 20)] });
      expect(out.targetEffects).toEqual([]);
    });

    it('grazes with the ability modifier on a miss', () => {
      const out = attack(pc('fighter', '2024', { inventory: [{ item: 'greatsword', equipped: true }] }), ogre(), {
        name: 'Greatsword',
        rng: [face(2, 20)],
      });
      expect(out.roll.hit).toBe(false);
      expect(out.graze).toEqual({ amount: 3, type: 'slashing' });
    });

    it('vexes: advantage on your next attack against the target only', () => {
      const out = attack(pc('rogue', '2024', { inventory: [{ item: 'shortsword', equipped: true }] }), ogre(), {
        name: 'Shortsword',
        rng: [face(15, 20)],
      });
      expect(out.targetEffects[0]).toMatchObject({ name: 'Vexed', advantageAgainst: true, onlyFor: 'pc' });
    });

    it('topples a target that fails a Constitution save', () => {
      const out = attack(pc('fighter', '2024', { inventory: [{ item: 'maul', equipped: true }] }), ogre(), {
        name: 'Maul',
        rng: [face(15, 20), face(1, 6), face(1, 6), face(1, 20)],
      });
      expect(out.targetEffects[0]).toMatchObject({ name: 'Prone', conditions: ['prone'] });
      expect(out.notes).toContain('Ogre is knocked prone');
    });
  });
});
