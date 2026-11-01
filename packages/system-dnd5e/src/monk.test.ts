import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { featureProblem, useFeature } from './features.ts';
import { type Token, TokenSchema } from './token-schema.ts';
import type { Edition } from './stats-schema.ts';

const character = (cls: string, rules: Edition, level = 5, data: object = {}) =>
  TokenSchema.parse({
    id: 'pc',
    name: 'PC',
    x: 50,
    y: 50,
    stats: { class: cls, level, rules, maxHp: 30, abilities: { str: 12, dex: 16, con: 14, wis: 16 } },
    ...data,
  });
const sheet = (t: Token) => resolveCreature(t, srdFor(t.stats?.rules ?? '2014'))!;
const feature = (t: Token, id: string) => sheet(t).features.find((f) => f.id === id);

describe('monk', () => {
  for (const [rules, pool] of [
    ['2014', 'ki'],
    ['2024', 'monks-focus'],
  ] as const) {
    it(`${rules}: has points equal to its level, spent by flurry of blows for two more attacks`, () => {
      const t = character('monk', rules);
      expect(feature(t, pool)).toMatchObject({ max: 5, left: 5, recharge: 'short' });
      const out = useFeature(t, sheet(t), 'flurry-of-blows');
      expect(out.grantAttacks).toBe(2);
      expect(feature(out.token, 'flurry-of-blows')).toMatchObject({ action: 'bonus', left: 4 });
    });

    it(`${rules}: patient defense dodges and step of the wind dashes as bonus actions for a point`, () => {
      const t = character('monk', rules);
      expect(useFeature(t, sheet(t), 'patient-defense').effect).toMatchObject({ disadvantageAgainst: true });
      expect(useFeature(t, sheet(t), 'step-of-the-wind').dash).toBe(sheet(t).speed);
    });

    it(`${rules}: martial arts gives a bonus unarmed strike, and stunning strike is aimed at a creature`, () => {
      const t = character('monk', rules);
      expect(feature(t, 'martial-arts')).toMatchObject({ action: 'bonus', grantAttacks: 1 });
      expect(feature(t, 'stunning-strike')?.spell).toMatchObject({ save: { ability: 'con' }, targets: 1 });
    });

    it(`${rules}: moves faster unarmored, more at higher levels`, () => {
      expect(sheet(character('monk', rules, 2)).speed).toBe(40);
      expect(sheet(character('monk', rules, 6)).speed).toBe(45);
    });
  }

  it('runs out of ki', () => {
    const t = character('monk', '2014', 2, { spent: { uses: { ki: 2 } } });
    expect(featureProblem(sheet(t), 'flurry-of-blows')).toMatch(/no uses/);
  });

  it('gives a 5th-level barbarian fast movement', () => {
    expect(sheet(character('barbarian', '2014')).speed).toBe(40);
    expect(sheet(character('barbarian', '2014', 4)).speed).toBe(30);
  });
});
