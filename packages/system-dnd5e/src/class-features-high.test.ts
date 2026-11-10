import { describe, expect, it } from 'vitest';
import { critRangeOf } from './class-styles.ts';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import type { Edition } from './stats-schema.ts';
import { type Token, TokenSchema } from './token-schema.ts';
import { resolveWeaponAttack } from './weapon-attack.ts';

// Class features from 6th level up that the engine runs.

const pc = (cls: string, level: number, rules: Edition = '2014', data: Record<string, unknown> = {}) => {
  const { stats, ...rest } = data;
  return TokenSchema.parse({
    id: 'pc',
    name: 'PC',
    x: 50,
    y: 50,
    stats: {
      class: cls,
      level,
      rules,
      maxHp: 60,
      abilities: { str: 16, dex: 16, con: 14, wis: 14, cha: 16 },
      ...(stats as object),
    },
    ...rest,
  });
};
const sheetOf = (t: Token) => resolveCreature(t, srdFor(t.stats?.rules ?? '2014'))!;
const feature = (t: Token, id: string) => sheetOf(t).features.find((f) => f.id === id);

describe('saving throws from class features', () => {
  it('gives a 14th-level monk proficiency in every save', () => {
    expect(sheetOf(pc('monk', 13)).proficientSaves).toEqual(['str', 'dex']);
    expect(sheetOf(pc('monk', 14)).proficientSaves?.toSorted()).toEqual(['cha', 'con', 'dex', 'int', 'str', 'wis']);
    // Charisma 16 (+3) with proficiency +5.
    expect(sheetOf(pc('monk', 14)).saves.cha).toBe(8);
    expect(sheetOf(pc('monk', 14, '2024')).proficientSaves).toHaveLength(6);
  });

  it('gives a 15th-level rogue Wisdom saves, and Charisma too in 2024', () => {
    expect(sheetOf(pc('rogue', 15)).proficientSaves).toEqual(['dex', 'int', 'wis']);
    expect(sheetOf(pc('rogue', 15, '2024')).proficientSaves).toEqual(['dex', 'int', 'wis', 'cha']);
  });
});

describe('passive features from 6th level', () => {
  it('gives monks and rogues evasion at 7th', () => {
    for (const cls of ['monk', 'rogue']) {
      expect(sheetOf(pc(cls, 6)).effects.some((e) => e.evasion)).toBe(false);
      expect(sheetOf(pc(cls, 7)).effects.some((e) => e.evasion)).toBe(true);
    }
  });

  it('lets a 15th-level champion crit on 18', () => {
    const champion = (level: number) =>
      pc('fighter', level, '2014', { stats: { classes: [{ class: 'fighter', level, subclass: 'champion' }] } });
    expect(critRangeOf(sheetOf(champion(14)))).toBe(19);
    expect(critRangeOf(sheetOf(champion(15)))).toBe(18);
  });

  it('makes a 10th-level monk immune to poison (2014)', () => {
    const monk = sheetOf(pc('monk', 10));
    expect(monk.immunities).toContain('poison');
    expect(
      sheetOf(pc('monk', 10, '2014', { effects: [{ id: 'p', name: 'Poisoned', conditions: ['poisoned'] }] }))
        .conditions,
    ).toEqual([]);
  });

  it('gives a 2024 ranger roving speed at 6th and blindsight at 18th', () => {
    expect(sheetOf(pc('ranger', 5, '2024')).speed).toBe(30);
    const ranger = sheetOf(pc('ranger', 18, '2024'));
    expect(ranger.speed).toBe(40);
    expect(ranger.speeds).toMatchObject({ climb: 40, swim: 40 });
    expect(ranger.senses?.blindsight).toBe(30);
  });
});

describe('features with uses from 6th level', () => {
  it('counts a fighter’s Indomitable: once at 9th, twice at 13th, three times at 17th', () => {
    expect(feature(pc('fighter', 8), 'indomitable')).toBeUndefined();
    expect([9, 13, 17].map((level) => feature(pc('fighter', level), 'indomitable')?.max)).toEqual([1, 2, 3]);
  });

  it('lets a 14th-level 2014 ranger hide as a bonus action (Vanish)', () => {
    expect(feature(pc('ranger', 14), 'vanish-hide')).toMatchObject({ action: 'bonus', name: 'Hide (Vanish)' });
    expect(feature(pc('ranger', 13), 'vanish-hide')).toBeUndefined();
  });

  it('heals an open hand monk three times its level with Wholeness of Body', () => {
    const monk = pc('monk', 6, '2014', {
      stats: { classes: [{ class: 'monk', level: 6, subclass: 'way-of-the-open-hand' }] },
    });
    expect(feature(monk, 'wholeness-of-body')).toMatchObject({ action: 'action', heal: 'level+level+level', max: 1 });
  });
});

describe('radiant strikes', () => {
  it('add 1d8 radiant to an 11th-level 2024 paladin’s melee hits, as Improved Divine Smite does in 2014', () => {
    const ogre = TokenSchema.parse({ id: 'ogre', name: 'Ogre', x: 150, y: 50, monster: 'ogre' });
    for (const rules of ['2014', '2024'] as Edition[]) {
      const paladin = pc('paladin', 11, rules, { inventory: [{ item: 'longsword', equipped: true }] });
      const attacker = { token: paladin, sheet: sheetOf(paladin) };
      const out = resolveWeaponAttack(
        {
          attacker,
          target: { token: ogre, sheet: resolveCreature(ogre, srdFor(rules))! },
          attack: attacker.sheet.attacks.find((a) => a.name === 'Longsword')!,
          range: 'normal',
          gridSize: 100,
          allyNearTarget: false,
          sneakUsed: false,
        },
        () => 0.7,
      );
      expect(out.roll.damage.map((d) => d.type)).toEqual(['slashing', 'radiant']);
    }
  });
});
