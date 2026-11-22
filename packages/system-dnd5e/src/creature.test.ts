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

  it('keeps a half-typed ability score out of range within 1 to 30 instead of failing', () => {
    const raw = { id: 't', name: 'T', x: 0, y: 0, stats: { abilities: { str: 158, dex: 0, con: 12.5 } } };
    const c = resolveCreature(raw as never, srdFor('2024'))!;
    expect(c.abilities).toMatchObject({ str: 30, dex: 1, con: 12 });
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
    expect(c.attacks).toMatchObject([
      { name: 'Longsword', kind: 'melee', toHit: 6, reach: 5, damage: [{ dice: '1d8+3', type: 'slashing' }] },
    ]);
  });

  it('attacks with a homemade weapon written as formulas, its magic bonus on top', () => {
    const blade = {
      type: 'weapon',
      id: 'mind-blade',
      name: 'Mind Blade',
      category: 'martial',
      kind: 'melee',
      damage: { dice: '1d10', type: 'psychic' },
      plus: 1,
      formula: { damage: '1d10 psychic + 1d6 fire + 2*dex + level', hit: 'cha + prof' },
    };
    const c = resolveCreature(
      token({
        stats: { level: 5, abilities: { str: 10, dex: 14, cha: 18 } },
        own: { items: [blade] },
        inventory: [{ item: 'mind-blade', equipped: true }],
      }),
      srdFor('2024'),
    )!;
    // Cha +4 and proficiency +3, then +1 magic; 2 × Dex +2 and level 5, then +1 magic.
    expect(c.attacks).toMatchObject([
      {
        name: 'Mind Blade',
        toHit: 8,
        damage: [
          { dice: '1d10+10', type: 'psychic' },
          { dice: '1d6', type: 'fire' },
        ],
      },
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
    expect(c.attacks).toMatchObject([
      { name: 'Dagger', kind: 'melee', toHit: 5, reach: 5, damage: [{ dice: '1d4+3', type: 'piercing' }] },
      { name: 'Longbow', kind: 'ranged', toHit: 5, range: [150, 600], damage: [{ dice: '1d8+3', type: 'piercing' }] },
    ]);
  });

  it('fights unarmed when nothing is equipped', () => {
    const c = resolveCreature(token({ stats: { abilities: { str: 14 } } }), srdFor('2024'))!;
    expect(c.attacks).toMatchObject([
      { name: 'Unarmed Strike', kind: 'melee', toHit: 4, reach: 5, damage: [{ dice: '3', type: 'bludgeoning' }] },
    ]);
  });

  it('ignores unknown monsters and items', () => {
    expect(resolveCreature(token({ monster: 'tarrasque-9000' }), srdFor('2024'))).toBeUndefined();
    const c = resolveCreature(token({ stats: {}, inventory: [{ item: 'laser', equipped: true }] }), srdFor('2024'))!;
    expect(c.attacks.map((a) => a.name)).toEqual(['Unarmed Strike']);
  });
});
