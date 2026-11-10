import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { featureCastProblem, featureCasts } from './free-casts.ts';
import { castProblem } from './spells.ts';
import type { Edition } from './stats-schema.ts';
import { TokenSchema } from './token-schema.ts';

const sheetOf = (monster: string, edition: Edition = '2014', data: object = {}) =>
  resolveCreature(TokenSchema.parse({ id: 'm', name: 'M', x: 0, y: 0, monster, ...data }), srdFor(edition))!;
const spell = (id: string, edition: Edition = '2014') => srdFor(edition).spells.get(id)!;

describe('a monster that casts spells', () => {
  it('casts with its stat block’s numbers and slots', () => {
    const { caster } = sheetOf('mage');
    expect(caster).toMatchObject({ ability: 'int', dc: 14, attack: 6, level: 9, slots: [4, 3, 3, 3, 1], pact: false });
    expect(caster!.left).toEqual([4, 3, 3, 3, 1]);
    expect(caster!.spells.map((s) => s.id)).toContain('fireball');
  });

  it('runs out of the slots it has spent', () => {
    const sheet = sheetOf('mage', '2014', { spent: { slots: [0, 0, 3] } });
    expect(sheet.caster!.left).toEqual([4, 3, 0, 3, 1]);
    expect(castProblem({ spell: spell('fireball'), slot: 3, sheet })).toMatch(/no 3rd-level slots left/);
    expect(castProblem({ spell: spell('fireball'), slot: 4, sheet })).toBeUndefined();
  });

  it('works out the DC and attack from the ability when the block gives none', () => {
    // A 2024 mage: Int 17 (+3), proficiency +3, and the block's own DC 14.
    const { caster } = sheetOf('mage', '2024');
    expect(caster).toMatchObject({ dc: 14, attack: 6, slots: [] });
  });

  it('casts innate spells through its features: at will, or so many times a day', () => {
    const drow = sheetOf('drow');
    expect(drow.caster!.spells.map((s) => s.id)).toEqual(['dancing-lights', 'darkness', 'faerie-fire']);
    expect(featureCasts(drow, spell('dancing-lights'))).toEqual([
      { feature: 'at-will', name: 'Spells at will', level: 0, self: false },
    ]);
    expect(featureCasts(drow, spell('darkness'))).toEqual([
      { feature: 'daily-darkness', name: 'Darkness (1/Day)', level: 2, self: false, left: 1, max: 1 },
    ]);
    const spent = sheetOf('drow', '2014', { spent: { uses: { 'daily-darkness': 1 } } });
    expect(featureCasts(spent, spell('darkness'))[0]).toMatchObject({ left: 0 });
  });

  it('casts a spell at the level its block names', () => {
    expect(featureCasts(sheetOf('mage', '2024'), spell('fireball', '2024'))[0]).toMatchObject({ level: 4, left: 2 });
  });

  it('without a caster level in its block, its cantrips scale with its challenge rating', () => {
    expect(sheetOf('adult-black-dragon', '2024').caster!.level).toBe(14);
    expect(sheetOf('green-hag').caster!.level).toBe(3);
    expect(sheetOf('drow').caster!.level).toBe(1);
  });

  it('casts a "cast before combat" spell only outside a fight', () => {
    const sheet = {
      features: [{ id: 'at-will', name: 'Spells at will', freeCasts: [{ spell: 'mage-armor', beforeCombat: true }] }],
    };
    const armor = spell('mage-armor');
    expect(featureCastProblem(sheet as never, armor, 'at-will')).toBeUndefined();
    expect(featureCastProblem(sheet as never, armor, 'at-will', { fighting: true })).toMatch(/before the fight/);
  });

  it('leaves a monster with no spellcasting without a caster', () => {
    expect(sheetOf('goblin').caster).toBeUndefined();
  });
});
