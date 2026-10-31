import { describe, expect, it } from 'vitest';
import {
  asiLevels,
  hitPointsAtLevel1,
  isImprovementLevel,
  pointBuyCost,
  POINT_BUY_BUDGET,
  spellLimits,
  STANDARD_ARRAY,
} from './character-rules.ts';
import { originsFor, skillName } from './origins.ts';

describe('point buy', () => {
  it('costs 27 points for 15, 15, 15, 8, 8, 8', () => {
    expect(pointBuyCost({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 })).toBe(27);
    expect(POINT_BUY_BUDGET).toBe(27);
  });

  it('refuses scores outside 8 to 15', () => {
    expect(pointBuyCost({ str: 16, dex: 8, con: 8, int: 8, wis: 8, cha: 8 })).toBeUndefined();
    expect(pointBuyCost({ str: 7, dex: 8, con: 8, int: 8, wis: 8, cha: 8 })).toBeUndefined();
  });

  it('has the standard array', () => {
    expect(STANDARD_ARRAY).toEqual([15, 14, 13, 12, 10, 8]);
  });
});

describe('ability score improvements', () => {
  it('comes at 4, 8, 12, 16 and 19, more often for fighters and rogues', () => {
    expect(asiLevels('wizard')).toEqual([4, 8, 12, 16, 19]);
    expect(asiLevels('fighter')).toEqual([4, 6, 8, 12, 14, 16, 19]);
    expect(asiLevels('rogue')).toEqual([4, 8, 10, 12, 16, 19]);
    expect(isImprovementLevel('fighter', 6)).toBe(true);
    expect(isImprovementLevel('wizard', 6)).toBe(false);
  });
});

describe('spellLimits', () => {
  it('counts cantrips and known spells for a 2014 sorcerer', () => {
    expect(spellLimits({ classId: 'sorcerer', level: 3, edition: '2014', mod: 3 })).toEqual({
      cantrips: 4,
      spells: 4,
      maxLevel: 2,
    });
  });

  it('prepares ability modifier plus level for a 2014 cleric, at least one', () => {
    expect(spellLimits({ classId: 'cleric', level: 1, edition: '2014', mod: 3 })).toMatchObject({ spells: 4 });
    expect(spellLimits({ classId: 'cleric', level: 1, edition: '2014', mod: -2 })).toMatchObject({ spells: 1 });
  });

  it('gives a 2014 wizard six spellbook spells plus two a level', () => {
    expect(spellLimits({ classId: 'wizard', level: 3, edition: '2014', mod: 3 })).toEqual({
      cantrips: 3,
      spells: 10,
      maxLevel: 2,
    });
  });

  it('starts 2014 paladins and rangers casting at level 2', () => {
    expect(spellLimits({ classId: 'paladin', level: 1, edition: '2014', mod: 3 })).toEqual({
      cantrips: 0,
      spells: 0,
      maxLevel: 0,
    });
    expect(spellLimits({ classId: 'ranger', level: 2, edition: '2014', mod: 3 })).toMatchObject({ spells: 2 });
  });

  it('uses the 2024 prepared spell tables', () => {
    expect(spellLimits({ classId: 'wizard', level: 1, edition: '2024', mod: 3 })).toEqual({
      cantrips: 3,
      spells: 4,
      maxLevel: 1,
    });
    expect(spellLimits({ classId: 'paladin', level: 1, edition: '2024', mod: 3 })).toMatchObject({ spells: 2 });
  });

  it('lets a warlock pick spells up to its pact slot level', () => {
    expect(spellLimits({ classId: 'warlock', level: 5, edition: '2014', mod: 3 })).toMatchObject({ maxLevel: 3 });
  });

  it('gives no spells to classes without spellcasting', () => {
    expect(spellLimits({ classId: 'fighter', level: 5, edition: '2014', mod: 3 })).toEqual({
      cantrips: 0,
      spells: 0,
      maxLevel: 0,
    });
  });
});

describe('hit points', () => {
  it('takes the full hit die plus Constitution at level 1', () => {
    expect(hitPointsAtLevel1(10, 2)).toBe(12);
    expect(hitPointsAtLevel1(6, -5)).toBe(1);
  });
});

describe('origins', () => {
  it('loads species, backgrounds and class options for both editions', () => {
    expect(originsFor('2014').species.map((s) => s.id)).toContain('half-elf');
    expect(originsFor('2024').species.map((s) => s.id)).toContain('goliath');
    expect(originsFor('2024').backgrounds.map((b) => b.id)).toEqual(['acolyte', 'criminal', 'sage', 'soldier']);
    expect(originsFor('2014').classes).toHaveLength(12);
  });

  it('names skills', () => {
    expect(skillName('sleight-of-hand')).toBe('Sleight of Hand');
  });
});
