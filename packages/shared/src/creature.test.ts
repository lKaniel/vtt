import { describe, expect, it } from 'vitest';
import { abilityMod, proficiencyForLevel, resolveCreature, srdFor, TokenSchema } from './index.ts';

const token = (data: object) => TokenSchema.parse({ id: 't', name: 'T', x: 50, y: 50, ...data });

describe('ability scores', () => {
  it('turns scores into modifiers', () => {
    expect([1, 8, 10, 11, 15, 20].map(abilityMod)).toEqual([-5, -1, 0, 0, 2, 5]);
  });

  it('grows proficiency with level', () => {
    expect([1, 4, 5, 9, 13, 17, 20].map(proficiencyForLevel)).toEqual([2, 2, 3, 4, 5, 6, 6]);
  });
});

describe('resolveCreature', () => {
  it('returns nothing for a plain token', () => {
    expect(resolveCreature(token({}), srdFor('2024'))).toBeUndefined();
  });

  it('reads a monster stat block from the SRD', () => {
    const c = resolveCreature(token({ monster: 'goblin-warrior' }), srdFor('2024'))!;
    expect(c).toMatchObject({ ac: 15, maxHp: 10, hp: 10, initiative: 2 });
    expect(c.attacks.map((a) => a.name)).toEqual(['Scimitar', 'Shortbow']);
  });

  it('lets the token override the stat block and track damage', () => {
    const c = resolveCreature(token({ monster: 'goblin-warrior', hp: 4, stats: { ac: 17 } }), srdFor('2024'))!;
    expect(c).toMatchObject({ ac: 17, maxHp: 10, hp: 4 });
  });

  it('builds a character from abilities, level and equipped items', () => {
    const c = resolveCreature(
      token({
        stats: { level: 5, maxHp: 44, abilities: { str: 16, dex: 14 } },
        inventory: [
          { item: 'longsword', equipped: true },
          { item: 'chain-shirt', equipped: true },
          { item: 'shield', equipped: true },
          { item: 'rapier' },
        ],
      }),
      srdFor('2024'),
    )!;
    // Chain shirt 13 + dex (max 2) + shield 2.
    expect(c.ac).toBe(17);
    expect(c.proficiency).toBe(3);
    expect(c.attacks).toEqual([
      { name: 'Longsword', kind: 'melee', toHit: 6, reach: 5, damage: [{ dice: '1d8+3', type: 'slashing' }] },
    ]);
  });

  it('uses the better of str and dex for finesse weapons and dex for ranged ones', () => {
    const c = resolveCreature(
      token({
        stats: { abilities: { str: 8, dex: 16 } },
        inventory: [
          { item: 'dagger', equipped: true },
          { item: 'longbow', equipped: true },
        ],
      }),
      srdFor('2024'),
    )!;
    expect(c.ac).toBe(13);
    expect(c.attacks).toEqual([
      { name: 'Dagger', kind: 'melee', toHit: 5, reach: 5, damage: [{ dice: '1d4+3', type: 'piercing' }] },
      { name: 'Longbow', kind: 'ranged', toHit: 5, range: [150, 600], damage: [{ dice: '1d8+3', type: 'piercing' }] },
    ]);
  });

  it('fights unarmed when nothing is equipped', () => {
    const c = resolveCreature(token({ stats: { abilities: { str: 14 } } }), srdFor('2024'))!;
    expect(c.attacks).toEqual([
      { name: 'Unarmed Strike', kind: 'melee', toHit: 4, reach: 5, damage: [{ dice: '3', type: 'bludgeoning' }] },
    ]);
  });

  it('ignores unknown monsters and items', () => {
    expect(resolveCreature(token({ monster: 'tarrasque-9000' }), srdFor('2024'))).toBeUndefined();
    const c = resolveCreature(token({ stats: {}, inventory: [{ item: 'laser', equipped: true }] }), srdFor('2024'))!;
    expect(c.attacks.map((a) => a.name)).toEqual(['Unarmed Strike']);
  });
});
