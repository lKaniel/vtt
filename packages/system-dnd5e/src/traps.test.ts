import { describe, expect, it } from 'vitest';
import { springTrap, TrapRulesSchema } from './traps.ts';

const sheet = {
  effects: [],
  conditions: [],
  saves: { str: 0, dex: 2, con: 0, int: 0, wis: 0, cha: 0 },
  hp: 20,
  tempHp: 0,
  resistances: [],
  immunities: [],
  vulnerabilities: [],
};

describe('traps', () => {
  it('read their rules from the region behaviour', () => {
    expect(TrapRulesSchema.parse({ save: 'dex', dc: 13, damage: '2d6', type: 'piercing', half: true })).toBeTruthy();
    expect(TrapRulesSchema.safeParse({ save: 'luck' }).success).toBe(false);
  });

  it('hurt a creature that fails its save, half as much one that makes it', () => {
    const rules = TrapRulesSchema.parse({ save: 'dex', dc: 13, damage: '2d6', type: 'piercing', half: true });
    // A d20 of 1 fails; every d6 rolls 6.
    const failed = springTrap(
      sheet,
      rules,
      () => 0.99,
      () => 0,
    );
    expect(failed).toMatchObject({ damage: 12, hp: 8, save: { success: false } });
    const made = springTrap(
      sheet,
      rules,
      () => 0.99,
      () => 0.99,
    );
    expect(made).toMatchObject({ damage: 6, hp: 14, save: { success: true } });
    expect(made.text).toBe('DEX save 22 vs DC 13: made it, 6 piercing damage');
  });

  it('hurt without a save, or only call for one', () => {
    expect(
      springTrap(
        sheet,
        TrapRulesSchema.parse({ damage: '3', type: 'fire' }),
        () => 0,
        () => 0,
      ),
    ).toMatchObject({
      damage: 3,
      text: '3 fire damage',
    });
    const save = springTrap(
      sheet,
      TrapRulesSchema.parse({ save: 'dex', dc: 25 }),
      () => 0,
      () => 0,
    );
    expect(save).toMatchObject({ damage: 0, hp: 20, text: 'DEX save 3 vs DC 25: failed' });
  });
});
