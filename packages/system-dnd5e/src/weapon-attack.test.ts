import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { type Token, TokenSchema } from './token-schema.ts';
import type { Edition } from './stats-schema.ts';
import { resolveWeaponAttack } from './weapon-attack.ts';
import { smiteProblem } from './riders.ts';

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

function attack(
  attacker: Token,
  target: Token,
  opts: { name: string; rng: number[]; allyNear?: boolean; smite?: number },
) {
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
      smite: opts.smite,
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

    it('pushes a Large or smaller target 10 feet on a hit', () => {
      const fighter = pc('fighter', '2024', { inventory: [{ item: 'warhammer', equipped: true }] });
      const hit = [face(15, 20), face(1, 8)];
      expect(attack(fighter, ogre(), { name: 'Warhammer', rng: hit }).push).toBe(10);
      expect(attack(fighter, ogre({ size: 3 }), { name: 'Warhammer', rng: hit }).push).toBeUndefined();
      expect(attack(fighter, ogre(), { name: 'Warhammer', rng: [face(2, 20)] }).push).toBeUndefined();
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

describe('riders on weapon hits', () => {
  const fighter = (data: object = {}) =>
    pc('fighter', '2014', { inventory: [{ item: 'longsword', equipped: true }], ...data });
  const formulas = (out: ReturnType<typeof attack>) => out.roll.damage.map((d) => `${d.roll.formula} ${d.type}`);

  it('adds damage from an effect on the attacker to every hit (divine favor)', () => {
    const favored = fighter({
      effects: [{ id: 'df', name: 'Divine Favor', hitDamage: [{ dice: '1d4', type: 'radiant' }] }],
    });
    const out = attack(favored, ogre(), { name: 'Longsword', rng: [face(15, 20)] });
    expect(formulas(out)).toEqual(['1d8+3 slashing', '1d4 radiant']);
    expect(out.used).toEqual([]);
  });

  it('spends a one-hit rider on the first hit only (branding smite)', () => {
    const smiting = {
      id: 'bs',
      name: 'Branding Smite',
      once: true,
      hitDamage: [{ dice: '2d6', type: 'radiant' as const }],
    };
    const miss = attack(fighter({ effects: [smiting] }), ogre(), { name: 'Longsword', rng: [face(2, 20)] });
    expect(miss.used).toEqual([]);
    const hit = attack(fighter({ effects: [smiting] }), ogre(), { name: 'Longsword', rng: [face(15, 20)] });
    expect(formulas(hit)).toContain('2d6 radiant');
    expect(hit.used).toEqual([{ token: 'pc', effect: 'bs' }]);
  });

  it("adds a mark's damage only for the creature that marked it, in the weapon's type when untyped", () => {
    const mark = {
      id: 'hm',
      name: "Hunter's Mark",
      onlyFor: 'pc',
      markDamage: [{ dice: '1d6', type: 'weapon' as const }],
    };
    const marked = ogre({ effects: [mark] });
    expect(formulas(attack(fighter(), marked, { name: 'Longsword', rng: [face(15, 20)] }))).toEqual([
      '1d8+3 slashing',
      '1d6 slashing',
    ]);
    const other = fighter({ id: 'other' });
    expect(formulas(attack(other, marked, { name: 'Longsword', rng: [face(15, 20)] }))).toEqual(['1d8+3 slashing']);
  });

  it('adds a magic weapon bonus to the attack and the damage', () => {
    const out = attack(fighter({ effects: [{ id: 'mw', name: 'Magic Weapon', weaponBonus: 1 }] }), ogre(), {
      name: 'Longsword',
      rng: [face(10, 20)],
    });
    expect(out.roll.total).toBe(10 + 5 + 1);
    expect(formulas(out)[0]).toBe('1d8+3+1 slashing');
  });

  it('smites with a spell slot: 2d8 radiant plus 1d8 per level above 1st, up to 5d8 (2014 paladin)', () => {
    const paladin = pc('paladin', '2014', { inventory: [{ item: 'longsword', equipped: true }] });
    expect(formulas(attack(paladin, ogre(), { name: 'Longsword', rng: [face(15, 20)], smite: 2 }))).toContain(
      '3d8 radiant',
    );
    expect(formulas(attack(paladin, ogre(), { name: 'Longsword', rng: [face(15, 20)], smite: 5 }))).toContain(
      '5d8 radiant',
    );
    const zombie = TokenSchema.parse({ id: 'z', name: 'Zombie', x: 150, y: 50, monster: 'zombie' });
    const out = attack(paladin, zombie, { name: 'Longsword', rng: [face(15, 20)], smite: 1 });
    expect(formulas(out)).toContain('3d8 radiant');
    expect(out.smote).toBe(true);
    expect(attack(paladin, ogre(), { name: 'Longsword', rng: [face(2, 20)], smite: 1 }).smote).toBe(false);
  });
});

describe('smiteProblem', () => {
  const sheet = (t: Token) => side(t).sheet;
  const sword = (t: Token) => sheet(t).attacks.find((a) => a.name === 'Longsword')!;

  it('needs the Divine Smite feature, a melee weapon and a slot left', () => {
    const paladin = pc('paladin', '2014', { inventory: [{ item: 'longsword', equipped: true }] });
    expect(smiteProblem(sheet(paladin), sword(paladin), 1)).toBeUndefined();
    expect(smiteProblem(sheet(paladin), sword(paladin), 2)).toMatch(/no 2nd-level slots/);
    const fighter = pc('fighter', '2014', { inventory: [{ item: 'longsword', equipped: true }] });
    expect(smiteProblem(sheet(fighter), sword(fighter), 1)).toMatch(/can't smite/);
    const archer = pc('paladin', '2014', { inventory: [{ item: 'longbow', equipped: true }] });
    expect(
      smiteProblem(
        sheet(archer),
        sheet(archer).attacks.find((a) => a.name === 'Longbow')!,
        1,
      ),
    ).toMatch(/melee/);
  });
});
