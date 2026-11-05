import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { resolveCast } from './spells.ts';
import { type Token, TokenSchema } from './token-schema.ts';
import type { Edition } from './stats-schema.ts';
import { resolveWeaponAttack } from './weapon-attack.ts';

// Class and subclass features up to 5th level that change the numbers:
// fighting styles, a champion's critical range, a life cleric's healing,
// draconic resilience.

const pc = (stats: object, data: object = {}, rules: Edition = '2014') =>
  TokenSchema.parse({
    id: 'pc',
    name: 'PC',
    x: 50,
    y: 50,
    stats: { rules, maxHp: 30, abilities: { str: 16, dex: 14, con: 12, wis: 16, cha: 16 }, ...stats },
    ...data,
  });
const ogre = () => TokenSchema.parse({ id: 'ogre', name: 'Ogre', x: 150, y: 50, monster: 'ogre' });
const sheet = (t: Token) => resolveCreature(t, srdFor(t.stats?.rules ?? '2014'))!;
const side = (t: Token) => ({ token: t, sheet: sheet(t) });
const face = (n: number, sides: number) => (n - 1) / sides + 0.001;
const rngOf = (values: number[]) => () => values.shift() ?? 0.001;
const attackOf = (t: Token, name: string) => sheet(t).attacks.find((a) => a.name === name)!;

function swing(attacker: Token, name: string, rng: number[]) {
  const a = side(attacker);
  return resolveWeaponAttack(
    {
      attacker: a,
      target: side(ogre()),
      attack: a.sheet.attacks.find((x) => x.name === name)!,
      range: 'normal',
      gridSize: 100,
      allyNearTarget: false,
      sneakUsed: false,
    },
    rngOf(rng),
  );
}

const fighter = (features: string[], inventory: object[], subclass?: string) =>
  pc({ classes: [{ class: 'fighter', level: 3, ...(subclass && { subclass }) }], features }, { inventory });

describe('fighting styles', () => {
  it('archery: +2 to ranged weapon attacks only', () => {
    const gear = [
      { item: 'longbow', equipped: true },
      { item: 'longsword', equipped: true },
    ];
    const plain = fighter([], gear);
    const archer = fighter(['fighter/archery'], gear);
    expect(attackOf(archer, 'Longbow').toHit - attackOf(plain, 'Longbow').toHit).toBe(2);
    expect(attackOf(archer, 'Longsword').toHit).toBe(attackOf(plain, 'Longsword').toHit);
  });

  it('defense: +1 AC while wearing armor', () => {
    const mail = [{ item: 'chain-mail', equipped: true }];
    expect(sheet(fighter(['fighter/defense'], mail)).ac - sheet(fighter([], mail)).ac).toBe(1);
    expect(sheet(fighter(['fighter/defense'], [])).ac).toBe(sheet(fighter([], [])).ac);
  });

  it('dueling: +2 damage with a one-handed melee weapon and no other weapon', () => {
    const out = swing(fighter(['fighter/dueling'], [{ item: 'longsword', equipped: true }]), 'Longsword', [
      face(15, 20),
    ]);
    expect(out.roll.damage.map((d) => d.roll.formula)).toEqual(['1d8+3', '2']);
  });

  it('two-weapon fighting: the off-hand attack keeps the ability modifier', () => {
    const blades = [
      { item: 'shortsword', equipped: true },
      { item: 'scimitar', equipped: true },
    ];
    const off = (t: Token) => sheet(t).attacks.find((a) => a.offHand)!.damage[0]!.dice;
    expect(off(fighter([], blades))).toMatch(/^1d6$/);
    expect(off(fighter(['fighter/two-weapon-fighting'], blades))).toBe('1d6+3');
  });
});

describe('subclass features', () => {
  it('a champion scores a critical hit on a 19', () => {
    const champion = fighter([], [{ item: 'longsword', equipped: true }], 'champion');
    expect(swing(champion, 'Longsword', [face(19, 20)]).roll.crit).toBe(true);
    expect(swing(fighter([], [{ item: 'longsword', equipped: true }]), 'Longsword', [face(19, 20)]).roll.crit).toBe(
      false,
    );
  });

  it('disciple of life: healing spells heal 2 + the spell’s level more', () => {
    const cleric = (subclass?: string) =>
      pc({ classes: [{ class: 'cleric', level: 1, ...(subclass && { subclass }) }] }, { hp: 1 });
    const heal = (t: Token) =>
      resolveCast(
        {
          spell: srdFor('2014').spells.get('cure-wounds')!,
          slot: 1,
          caster: side(t),
          targets: [side(t)],
          gridSize: 100,
        },
        rngOf([face(5, 8)]),
      ).results[0]!.healed;
    expect(heal(cleric('life-domain'))! - heal(cleric())!).toBe(3);
  });

  it('draconic resilience: 13 + Dex unarmored and a hit point per level', () => {
    const sorcerer = (subclass?: string) =>
      pc({ classes: [{ class: 'sorcerer', level: 3, ...(subclass && { subclass }) }] });
    expect(sheet(sorcerer('draconic-bloodline')).ac).toBe(15);
    expect(sheet(sorcerer('draconic-bloodline')).maxHp - sheet(sorcerer()).maxHp).toBe(3);
  });
});
