import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { castProblem } from './spells.ts';
import { featureCastProblem, featureCasts, payWithFeature } from './free-casts.ts';
import { type Token, TokenSchema } from './token-schema.ts';
import type { Edition } from './stats-schema.ts';

// Features that let a character cast a spell without a slot: a ranger's
// favored enemy (hunter's mark, a few times a day), a warlock's invocations
// (at will), a druid's wild companion (a use of wild shape).

const character = (cls: string, rules: Edition, stats: object = {}, data: object = {}) =>
  TokenSchema.parse({
    id: 'pc',
    name: 'PC',
    x: 50,
    y: 50,
    stats: { class: cls, level: 3, rules, maxHp: 30, abilities: { wis: 16, cha: 16 }, ...stats },
    ...data,
  });
const sheet = (t: Token) => resolveCreature(t, srdFor(t.stats?.rules ?? '2014'))!;
const spell = (t: Token, id: string) => srdFor(t.stats?.rules ?? '2014').spells.get(id)!;

describe('casting with a feature instead of a slot', () => {
  it('offers a 2024 ranger two free hunter’s marks, then one fewer after each', () => {
    const ranger = character('ranger', '2024', { level: 1 });
    expect(featureCasts(sheet(ranger), spell(ranger, 'hunters-mark'))).toEqual([
      { feature: 'favored-enemy', name: 'Favored Enemy', level: 1, self: false, left: 2, max: 2 },
    ]);
    const after = payWithFeature(ranger, sheet(ranger), 'favored-enemy');
    expect(featureCasts(sheet(after), spell(after, 'hunters-mark'))[0]).toMatchObject({ left: 1, max: 2 });
  });

  it('refuses a feature with no uses left, one that doesn’t cast that spell, and one the character lacks', () => {
    const spent = character('ranger', '2024', { level: 1 }, { spent: { uses: { 'favored-enemy': 2 } } });
    const mark = spell(spent, 'hunters-mark');
    expect(featureCastProblem(sheet(spent), mark, 'favored-enemy')).toBe('has no uses left of Favored Enemy');
    expect(featureCastProblem(sheet(spent), spell(spent, 'cure-wounds'), 'favored-enemy')).toBe(
      "can't cast Cure Wounds with Favored Enemy",
    );
    expect(featureCastProblem(sheet(spent), mark, 'rage')).toBe("doesn't have that feature");
  });

  it('lets a warlock with armor of shadows cast mage armor on themself at will', () => {
    const warlock = character('warlock', '2014', { level: 2, features: ['warlock/armor-of-shadows'] });
    const armor = spell(warlock, 'mage-armor');
    expect(featureCasts(sheet(warlock), armor)).toEqual([
      { feature: 'armor-of-shadows', name: 'Armor of Shadows', level: 1, self: true },
    ]);
    expect(featureCastProblem(sheet(warlock), armor, 'armor-of-shadows')).toBeUndefined();
    expect(payWithFeature(warlock, sheet(warlock), 'armor-of-shadows')).toEqual(warlock);
  });

  it('knows the spells its features cast, so they can be cast with no slots left', () => {
    const warlock = character(
      'warlock',
      '2024',
      { level: 2, features: ['warlock/misty-visions'] },
      { spent: { slots: [2] } },
    );
    const image = spell(warlock, 'silent-image');
    expect(sheet(warlock).caster!.spells.map((s) => s.id)).toContain('silent-image');
    expect(castProblem({ spell: image, slot: 1, sheet: sheet(warlock) })).toBe('has no 1st-level slots left');
    expect(featureCastProblem(sheet(warlock), image, 'misty-visions')).toBeUndefined();
  });

  it('spends a use of wild shape for a 2024 druid’s wild companion', () => {
    const druid = character('druid', '2024', { level: 2 });
    const familiar = spell(druid, 'find-familiar');
    expect(featureCasts(sheet(druid), familiar)[0]).toMatchObject({ feature: 'wild-companion', left: 2 });
    const after = payWithFeature(druid, sheet(druid), 'wild-companion');
    expect(after.spent?.uses).toEqual({ 'wild-shape': 1 });
  });
});
