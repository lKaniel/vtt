import type { PackCompendium } from '@vtt/core';
import { describe, expect, it } from 'vitest';
import { checkBonus } from './checks.ts';
import { resolveCreature } from './creature.ts';
import { featureProblem, featureSpell, useFeature } from './features.ts';
import { contentWith } from './packs.ts';
import type { Edition } from './stats-schema.ts';
import { type Token, TokenSchema } from './token-schema.ts';
import { poolSpell } from './finishers.ts';

// A monk subclass a game brings itself (a pack or a homebrew document names
// its features; their automation is in class-automation.json): summoned
// arms that strike with Wisdom for force damage, a visage that sees in the
// dark, a body that turns energy aside, and all three at once.

const SUBCLASS = {
  class: 'monk',
  id: 'way-of-the-astral-self',
  name: 'Astral Self',
  features: [
    { id: 'arms-of-the-astral-self', name: 'Arms', level: 3 },
    { id: 'visage-of-the-astral-self', name: 'Visage', level: 6 },
    { id: 'body-of-the-astral-self', name: 'Body', level: 11 },
    { id: 'awakened-astral-self', name: 'Awakened', level: 17 },
  ],
};
const pack: PackCompendium = {
  pack: 'astral',
  id: 'subclasses',
  type: 'subclass',
  path: 'subclasses.json',
  docs: [SUBCLASS],
};
const books = (rules: Edition) => contentWith(rules, [pack]);

const monk = (level: number, rules: Edition = '2014', data: object = {}) =>
  TokenSchema.parse({
    id: 'pc',
    name: 'PC',
    x: 50,
    y: 50,
    stats: {
      rules,
      classes: [{ class: 'monk', level, subclass: 'way-of-the-astral-self' }],
      maxHp: 60,
      abilities: { str: 10, dex: 16, con: 14, wis: 18 },
    },
    ...data,
  });
const sheet = (t: Token, rules: Edition = '2014') => resolveCreature(t, books(rules))!;
const use = (t: Token, id: string, rules: Edition = '2014') => useFeature(t, sheet(t, rules), id).token;
const attack = (t: Token, name: string, rules: Edition = '2014') =>
  sheet(t, rules).attacks.find((a) => a.name === name);

describe('a monk’s martial arts', () => {
  it('strikes unarmed with its martial arts die and the better of Strength and Dexterity', () => {
    expect(attack(monk(3), 'Unarmed Strike')).toMatchObject({
      toHit: 5,
      damage: [{ dice: '1d4+3', type: 'bludgeoning' }],
    });
    expect(attack(monk(11), 'Unarmed Strike')?.damage[0]?.dice).toBe('1d8+3');
    expect(attack(monk(5, '2024'), 'Unarmed Strike', '2024')?.damage[0]?.dice).toBe('1d8+3');
  });

  it('keeps its unarmed strike with a weapon in hand', () => {
    const t = monk(3, '2014', { inventory: [{ item: 'quarterstaff', equipped: true }] });
    expect(sheet(t).attacks.map((a) => a.name)).toEqual(['Unarmed Strike', 'Quarterstaff']);
  });
});

describe('way of the astral self', () => {
  it('summons the arms for a ki point as a bonus action, bursting on foes around for two martial arts dice', () => {
    const t = monk(3);
    const arms = sheet(t).features.find((f) => f.id === 'arms-of-the-astral-self')!;
    expect(arms).toMatchObject({ action: 'bonus', usesFrom: 'ki', left: 3 });
    const burst = poolSpell(featureSpell(arms), arms, sheet(t));
    expect(burst).toMatchObject({
      area: { shape: 'emanation', size: 10 },
      spares: 'allies',
      save: { ability: 'dex', dc: 14 },
      damage: [{ dice: '2d4', type: 'force' }],
    });
    const after = use(t, 'arms-of-the-astral-self');
    expect(after.spent?.uses?.ki).toBe(1);
  });

  it('strikes with the arms using Wisdom, for force damage, with 5 ft more reach', () => {
    const t = use(monk(3), 'arms-of-the-astral-self');
    expect(attack(t, 'Astral Arms')).toMatchObject({
      kind: 'melee',
      toHit: 6,
      reach: 10,
      damage: [{ dice: '1d4+4', type: 'force' }],
    });
    expect(attack(monk(3), 'Astral Arms')).toBeUndefined();
  });

  it('uses Wisdom for Strength checks and saves while the arms are out', () => {
    const t = use(monk(3), 'arms-of-the-astral-self');
    // A monk is proficient in Strength saves: +2 on top of the modifier.
    expect(checkBonus(t, sheet(t), { ability: 'str', save: true })).toBe(6);
    expect(checkBonus(t, sheet(t), { ability: 'str', skill: 'athletics' })).toBe(4);
    expect(checkBonus(monk(3), sheet(monk(3)), { ability: 'str', save: true })).toBe(2);
  });

  it('sees in magical darkness and reads people with the visage', () => {
    const t = use(monk(6), 'visage-of-the-astral-self');
    const s = sheet(t);
    expect(s.senses).toMatchObject({ darkvision: 120, devilsSight: 120 });
    expect(s.effects.find((e) => e.name === 'Visage of the Astral Self')?.checkAdvantageFor).toEqual([
      'insight',
      'intimidation',
    ]);
  });

  it('shows the body only with both arms and visage: energy turned aside and a stronger blow once a turn', () => {
    const t = monk(11);
    expect(featureProblem(sheet(t), 'body-of-the-astral-self')).toMatch(/arms .* visage/i);
    const both = use(use(t, 'arms-of-the-astral-self'), 'visage-of-the-astral-self');
    expect(featureProblem(sheet(both), 'body-of-the-astral-self')).toBeUndefined();
    const body = sheet(use(both, 'body-of-the-astral-self'));
    expect(body.effects.find((e) => e.ward)?.ward).toEqual({
      dice: '1d10+4',
      types: ['acid', 'cold', 'fire', 'force', 'lightning', 'thunder'],
    });
    expect(body.attacks.find((a) => a.name === 'Astral Arms')?.onceDamage).toEqual([{ dice: '1d8', type: 'force' }]);
  });

  it('awakens all three for five ki: +2 AC and three attacks with the arms', () => {
    const t = monk(17);
    const before = sheet(t);
    const awake = use(t, 'awakened-astral-self');
    expect(awake.spent?.uses?.ki).toBe(5);
    const s = sheet(awake);
    expect(s.ac).toBe(before.ac + 2);
    expect(s.attacksPerAction).toBe(3);
    expect(s.senses?.devilsSight).toBe(120);
    expect(s.attacks.find((a) => a.name === 'Astral Arms')).toMatchObject({
      damage: [{ dice: '1d10+4', type: 'force' }],
      onceDamage: [{ dice: '1d10', type: 'force' }],
    });
    expect(featureProblem(sheet(monk(17, '2014', { spent: { uses: { ki: 13 } } })), 'awakened-astral-self')).toMatch(
      /ki/,
    );
  });

  it('spends focus points in 2024', () => {
    const t = monk(3, '2024');
    expect(sheet(t, '2024').features.find((f) => f.id === 'arms-of-the-astral-self')).toMatchObject({
      usesFrom: 'monks-focus',
    });
    expect(attack(use(t, 'arms-of-the-astral-self', '2024'), 'Astral Arms', '2024')?.damage[0]?.dice).toBe('1d6+4');
  });
});
