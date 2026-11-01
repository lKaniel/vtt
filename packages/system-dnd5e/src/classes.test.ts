import { describe, expect, it } from 'vitest';
import { casterSheet, levelValue, spellSlots } from './classes.ts';
import { srdFor } from './content.ts';
import { TokenSchema } from './token-schema.ts';

const token = (data: object) => TokenSchema.parse({ id: 't', name: 'T', x: 50, y: 50, ...data });
const abilities = { str: 10, dex: 10, con: 10, int: 16, wis: 14, cha: 18 };

describe('level tables', () => {
  it('takes the value for the highest level reached', () => {
    const table: [number, number][] = [
      [1, 2],
      [3, 3],
      [6, 4],
    ];
    expect([1, 2, 3, 5, 6, 20].map((l) => levelValue(table, l))).toEqual([2, 2, 3, 3, 4, 4]);
    expect(levelValue([[2, 1]], 1)).toBe(0);
  });
});

describe('spell slots', () => {
  it('follows the full caster table', () => {
    expect(spellSlots({ progression: 'full', from: 1 }, 1)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(spellSlots({ progression: 'full', from: 1 }, 5)).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
    expect(spellSlots({ progression: 'full', from: 1 }, 20)).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
  });

  it('gives half casters slots from level 2 in 2014 and from level 1 in 2024', () => {
    expect(spellSlots({ progression: 'half', from: 2 }, 1)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(spellSlots({ progression: 'half', from: 2 }, 5)).toEqual([4, 2, 0, 0, 0, 0, 0, 0, 0]);
    expect(spellSlots({ progression: 'half', from: 1 }, 1)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('puts all of a warlock’s pact slots at one level', () => {
    expect(spellSlots({ progression: 'pact', from: 1 }, 1)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(spellSlots({ progression: 'pact', from: 1 }, 5)).toEqual([0, 0, 2, 0, 0, 0, 0, 0, 0]);
    expect(spellSlots({ progression: 'pact', from: 1 }, 11)).toEqual([0, 0, 0, 0, 3, 0, 0, 0, 0]);
  });
});

describe('casterSheet', () => {
  it('works out attack bonus, save DC and slots left from the class', () => {
    const wizard = token({
      stats: { class: 'Wizard', level: 3, spells: ['fire-bolt', 'magic-missile'] },
      spent: { slots: [1] },
    });
    const sheet = casterSheet(wizard, { abilities, proficiency: 2 }, srdFor('2014'))!;
    expect(sheet).toMatchObject({ ability: 'int', attack: 5, dc: 13, level: 3 });
    expect(sheet.slots.slice(0, 3)).toEqual([4, 2, 0]);
    expect(sheet.left.slice(0, 3)).toEqual([3, 2, 0]);
    expect(sheet.spells.map((s) => s.id)).toEqual(['fire-bolt', 'magic-missile']);
  });

  it('uses the spellcasting written on the token for homebrew casters', () => {
    const illusionist = token({ stats: { class: 'Illusionist', level: 1, spellcasting: { ability: 'wis' } } });
    expect(casterSheet(illusionist, { abilities, proficiency: 2 }, srdFor('2014'))).toMatchObject({ dc: 12 });
  });

  it('is undefined for creatures that cast nothing', () => {
    const fighter = token({ stats: { class: 'Fighter', level: 3 } });
    expect(casterSheet(fighter, { abilities, proficiency: 2 }, srdFor('2014'))).toBeUndefined();
  });

  it('follows the character’s own edition', () => {
    const paladin = token({ stats: { class: 'paladin', level: 1, spells: ['bless'] } });
    expect(casterSheet(paladin, { abilities, proficiency: 2 }, srdFor('2014'))?.slots[0]).toBe(0);
    expect(casterSheet(paladin, { abilities, proficiency: 2 }, srdFor('2024'))?.slots[0]).toBe(2);
  });
});
