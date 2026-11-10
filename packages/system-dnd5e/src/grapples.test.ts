import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { useFeature } from './features.ts';
import { grappleSave } from './grapples.ts';
import { TokenSchema } from './token-schema.ts';
import type { Edition } from './stats-schema.ts';

const side = (rules: Edition, data: object) => {
  const token = TokenSchema.parse({ id: 'c', name: 'C', x: 50, y: 50, ...data });
  return { token, sheet: resolveCreature(token, srdFor(rules))! };
};
const fighter = (rules: Edition, more: object = {}) =>
  side(rules, { stats: { class: 'fighter', level: 5, rules, abilities: { str: 18, dex: 10 }, ...more } });
/** Dice that roll these d20 faces in turn. */
const rolling = (...faces: number[]) => {
  const left = [...faces];
  return () => (left.shift()! - 1) / 20 + 0.001;
};
const feature = (rules: Edition, id: string) => fighter(rules).sheet.features.find((f) => f.id === id);

describe('the actions anyone can take against or for another creature', () => {
  it('everyone can Help, Hide, Grapple and Shove; grappling and shoving take one attack', () => {
    for (const rules of ['2014', '2024'] as const) {
      expect(['help', 'hide', 'grapple', 'shove'].map((id) => feature(rules, id)?.action)).toEqual([
        'action',
        'action',
        'attack',
        'attack',
      ]);
    }
  });

  it('a grapple leaves the target grappled, a shove knocks it prone or pushes it 5 feet', () => {
    expect(feature('2014', 'grapple')?.spell).toMatchObject({
      range: 5,
      save: { grapple: true },
      effect: { conditions: ['grappled'] },
    });
    const shove = feature('2014', 'shove')?.spell as { choices: { id: string; set: object }[] };
    expect(shove.choices.map((c) => c.id)).toEqual(['prone', 'push']);
    expect(shove.choices[1]?.set).toMatchObject({ push: 5 });
  });

  it('helping gives an ally advantage on its next attack', () => {
    expect(feature('2024', 'help')?.spell).toMatchObject({
      range: 5,
      effect: { name: 'Helped', advantage: true, once: true, rounds: 1 },
    });
  });

  it('a rogue hides as a bonus action with Cunning Action', () => {
    const rogue = side('2014', { stats: { class: 'rogue', level: 3, abilities: { dex: 16 }, skills: ['stealth'] } });
    expect(rogue.sheet.features.find((f) => f.id === 'cunning-hide')).toMatchObject({
      action: 'bonus',
      name: 'Hide (Cunning Action)',
    });
  });

  it('hiding rolls Stealth and leaves the creature hidden until it attacks', () => {
    const rogue = side('2014', { stats: { class: 'rogue', level: 3, abilities: { dex: 16 }, skills: ['stealth'] } });
    const out = useFeature(rogue.token, rogue.sheet, 'hide', rolling(12));
    // Dexterity +3, proficiency +2.
    expect(out.check).toEqual({ name: 'Stealth', total: 17 });
    expect(out.effect).toMatchObject({
      name: 'Hidden',
      advantage: true,
      disadvantageAgainst: true,
      endsOnAttack: true,
    });
  });
});

describe('grappleSave', () => {
  it('2014: Athletics against the better of Athletics and Acrobatics; a tie goes to the target', () => {
    const grappler = fighter('2014', { skills: ['athletics'] }); // +4 +3
    const nimble = side('2014', { stats: { level: 1, abilities: { str: 8, dex: 16 }, skills: ['acrobatics'] } }); // +3 +2
    const held = grappleSave(grappler, nimble, rolling(10, 11));
    expect(held).toMatchObject({ ability: 'dex', dc: 17, total: 16, success: false });
    expect(grappleSave(grappler, nimble, rolling(10, 12))).toMatchObject({ total: 17, success: true });
  });

  it('2024: a Strength or Dexterity save, whichever is better, against 8 + Strength + proficiency', () => {
    const grappler = fighter('2024');
    const nimble = side('2024', { stats: { level: 1, rules: '2024', abilities: { str: 8, dex: 16 } } });
    const save = grappleSave(grappler, nimble, rolling(11));
    // DC 8 + 4 + 3; Dexterity +3.
    expect(save).toMatchObject({ ability: 'dex', dc: 15, total: 14, success: false });
    expect(grappleSave(grappler, nimble, rolling(12)).success).toBe(true);
  });
});
