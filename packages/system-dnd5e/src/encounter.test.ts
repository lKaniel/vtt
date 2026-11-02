import { describe, expect, it } from 'vitest';
import { encounterDifficulty, gainXp, levelForXp, nextLevelXp, xpForCr } from './encounter.ts';
import { TokenSchema } from './token-schema.ts';

describe('experience', () => {
  it('is worth more the higher the challenge rating', () => {
    expect([0, 0.125, 0.25, 0.5, 1, 5, 10, 30].map(xpForCr)).toEqual([10, 25, 50, 100, 200, 1800, 5900, 155000]);
  });

  it('sets the level a character can reach', () => {
    expect([0, 299, 300, 6500, 355000].map(levelForXp)).toEqual([1, 1, 2, 5, 20]);
    expect(nextLevelXp(1)).toBe(300);
    expect(nextLevelXp(4)).toBe(6500);
    expect(nextLevelXp(20)).toBeUndefined();
  });

  it('is added to the character', () => {
    const hero = TokenSchema.parse({ id: 'h', name: 'Hero', x: 0, y: 0, stats: { level: 1, xp: 100 } });
    expect(gainXp(hero, 250).stats?.xp).toBe(350);
    expect(gainXp({ ...hero, stats: { level: 1 } }, 50).stats?.xp).toBe(50);
  });
});

describe('encounter difficulty (2014)', () => {
  it('multiplies the monsters’ XP by their number against the party’s thresholds', () => {
    // Four 3rd-level characters: easy 300, medium 600, hard 900, deadly 1600.
    const party = [3, 3, 3, 3];
    const fourGoblins = encounterDifficulty(party, [0.25, 0.25, 0.25, 0.25], '2014');
    expect(fourGoblins).toMatchObject({ xp: 200, adjusted: 400, difficulty: 'easy' });
    expect(fourGoblins.thresholds).toEqual({ easy: 300, medium: 600, hard: 900, deadly: 1600 });
    expect(encounterDifficulty(party, [3], '2014')).toMatchObject({ adjusted: 700, difficulty: 'medium' });
    expect(encounterDifficulty(party, [5], '2014').difficulty).toBe('deadly');
    expect(encounterDifficulty(party, [0], '2014').difficulty).toBe('trivial');
  });

  it('counts a small party’s foes as more, a big party’s as fewer', () => {
    expect(encounterDifficulty([3, 3], [1, 1], '2014').adjusted).toBe(400 * 2);
    expect(encounterDifficulty([3, 3, 3, 3, 3, 3], [1, 1], '2014').adjusted).toBe(400 * 1);
  });
});

describe('encounter difficulty (2024)', () => {
  it('weighs the monsters’ XP against the party’s budget, without multipliers', () => {
    // Four 3rd-level characters: low 600, moderate 900, high 1600.
    const party = [3, 3, 3, 3];
    const result = encounterDifficulty(party, [1, 1, 1, 1], '2024');
    expect(result).toMatchObject({ xp: 800, adjusted: 800, difficulty: 'low' });
    expect(result.thresholds).toEqual({ low: 600, moderate: 900, high: 1600 });
    expect(encounterDifficulty(party, [4], '2024').difficulty).toBe('moderate');
    expect(encounterDifficulty(party, [1, 1, 1, 1, 1, 1, 1, 1], '2024').difficulty).toBe('high');
    expect(encounterDifficulty(party, [8], '2024').difficulty).toBe('beyond');
  });

  it('is trivial without a party or foes', () => {
    expect(encounterDifficulty([], [1], '2024').difficulty).toBe('trivial');
    expect(encounterDifficulty([3], [], '2014')).toMatchObject({ xp: 0, difficulty: 'trivial' });
  });
});
