import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { featureCasts } from './free-casts.ts';
import { pickOptions } from './spell-picks.ts';
import type { Edition } from './stats-schema.ts';
import { type Token, TokenSchema } from './token-schema.ts';

// Spells a player picks for a feature: Mystic Arcanum, Spell Mastery,
// Signature Spells kept on the sheet, and a 2024 cleric's Divine
// Intervention picked as it is cast.

const pc = (rules: Edition, [cls, level]: [string, number], stats: object = {}) =>
  TokenSchema.parse({
    id: 'pc',
    name: 'PC',
    x: 50,
    y: 50,
    stats: { rules, class: cls, level, maxHp: 60, abilities: { cha: 18, int: 18, wis: 18 }, ...stats },
  });
const sheet = (t: Token) => resolveCreature(t, srdFor(t.stats?.rules ?? '2014'))!;
const spell = (t: Token, id: string) => srdFor(t.stats?.rules ?? '2014').spells.get(id)!;

describe('spells picked for a feature', () => {
  it('casts the Mystic Arcanum picked once a long rest, and knows it', () => {
    const warlock = pc('2014', ['warlock', 11], { spellPicks: { 'mystic-arcanum': ['eyebite'] } });
    expect(sheet(warlock).caster?.spells.map((s) => s.id)).toContain('eyebite');
    expect(featureCasts(sheet(warlock), spell(warlock, 'eyebite'))).toEqual([
      { feature: 'mystic-arcanum', name: 'Mystic Arcanum', level: 6, self: false, left: 1, max: 1 },
    ]);
    expect(featureCasts(sheet(warlock), spell(warlock, 'mass-suggestion'))).toEqual([]);
  });

  it("ignores a pick that doesn't fit: a 7th-level spell before 13th level", () => {
    const warlock = pc('2014', ['warlock', 11], { spellPicks: { 'mystic-arcanum': ['plane-shift'] } });
    expect(sheet(warlock).caster?.spells.map((s) => s.id)).not.toContain('plane-shift');
    expect(featureCasts(sheet(warlock), spell(warlock, 'plane-shift'))).toEqual([]);
  });

  it('casts the spells of Spell Mastery at will', () => {
    const spells = ['shield', 'misty-step', 'fireball'];
    const wizard = pc('2014', ['wizard', 18], { spells, spellPicks: { 'spell-mastery': ['shield', 'misty-step'] } });
    expect(featureCasts(sheet(wizard), spell(wizard, 'misty-step'))).toEqual([
      { feature: 'spell-mastery', name: 'Spell Mastery', level: 2, self: false },
    ]);
  });

  it('lets a 2024 cleric cast any cleric spell of 5th level or lower with Divine Intervention', () => {
    const cleric = pc('2024', ['cleric', 10]);
    expect(featureCasts(sheet(cleric), spell(cleric, 'flame-strike'))[0]).toMatchObject({
      feature: 'divine-intervention',
      level: 5,
      atCast: true,
    });
    expect(featureCasts(sheet(cleric), spell(cleric, 'heal'))).toEqual([]);
    expect(featureCasts(sheet(cleric), spell(cleric, 'fireball'))).toEqual([]);
  });

  it('offers each open choice the spells that fit it', () => {
    const warlock = pc('2014', ['warlock', 13]);
    const arcanum = sheet(warlock).features.find((f) => f.id === 'mystic-arcanum')!;
    const [sixth, seventh] = pickOptions(arcanum.spellPicks!, 13, srdFor('2014').spells.values());
    expect(sixth!.every((s) => s.level === 6 && s.classes.includes('warlock'))).toBe(true);
    expect(seventh!.map((s) => s.id)).toContain('plane-shift');
  });
});
