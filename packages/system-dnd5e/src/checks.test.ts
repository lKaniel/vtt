import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { checkBonus, checkOutcome, rollCheck } from './checks.ts';
import { TokenSchema } from './token-schema.ts';

const book = srdFor('2014');
const hero = TokenSchema.parse({
  id: 'h',
  name: 'Hero',
  x: 0,
  y: 0,
  stats: { class: 'rogue', level: 5, abilities: { dex: 16, str: 10 }, skills: ['stealth'] },
});
const sheet = resolveCreature(hero, book)!;

describe('ability checks', () => {
  it('add the ability modifier, and proficiency for a skill the creature has', () => {
    expect(checkBonus(hero, sheet, { ability: 'dex' })).toBe(3);
    expect(checkBonus(hero, sheet, { ability: 'dex', skill: 'stealth' })).toBe(6);
    expect(checkBonus(hero, sheet, { ability: 'dex', skill: 'acrobatics' })).toBe(3);
  });

  it('roll a d20, with disadvantage and bonus dice from effects, against a DC', () => {
    const roll = rollCheck(hero, sheet, { ability: 'dex', skill: 'stealth', dc: 15 }, () => 0.5);
    expect(roll).toMatchObject({ total: 17, success: true });
    const tired = resolveCreature({ ...hero, exhaustion: 1 }, book)!;
    const low = rollCheck(hero, tired, { ability: 'dex' }, () => 0.5);
    expect(low.roll?.formula).toMatch(/^2d20kl1/);
    expect(low.success).toBeUndefined();
  });
});

describe('check outcomes', () => {
  const rolled = (total: number, success?: boolean) => ({ token: 't', name: 'T', total, success });

  it('passes a group check when at least half succeed', () => {
    expect(checkOutcome('group', [rolled(15, true), rolled(5, false)])).toBe('The group succeeds');
    expect(checkOutcome('group', [rolled(15, true), rolled(5, false), rolled(4, false)])).toBe('The group fails');
    expect(checkOutcome('group', [rolled(15, true), { token: 'u', name: 'U' }])).toBeUndefined();
  });

  it('gives a contest to the higher total, a tie to neither', () => {
    const a = { token: 'a', name: 'Ana', total: 14 };
    const b = { token: 'b', name: 'Bo', total: 9 };
    expect(checkOutcome('contest', [a, b])).toBe('Ana wins');
    expect(checkOutcome('contest', [a, { ...b, total: 14 }])).toBe('A tie: nothing changes');
  });

  it('says nothing more for a plain request', () => {
    expect(checkOutcome('each', [rolled(15, true)])).toBeUndefined();
  });
});
