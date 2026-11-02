import { describe, expect, it } from 'vitest';
import { casterSheet } from './classes.ts';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { hitDiceOf, spendHitDie } from './vigour.ts';
import { characterLevel, classesText, classLevels, multiclassProblem } from './multiclass.ts';
import { dnd5e } from './system.ts';
import { TokenSchema } from './token-schema.ts';

const book = srdFor('2014');
const token = (stats: object, data: object = {}) =>
  TokenSchema.parse({ id: 't', name: 'T', x: 50, y: 50, stats, ...data });
const abilities = { str: 16, dex: 14, con: 14, int: 16, wis: 13, cha: 14 };
const basics = { abilities, proficiency: 3 };

describe('class levels', () => {
  it('reads a list of classes, or the single class and level', () => {
    const multi = token({
      classes: [
        { class: 'fighter', level: 3 },
        { class: 'Wizard', level: 2 },
      ],
    });
    expect(classLevels(multi, book).map((c) => [c.id, c.cls?.name, c.level])).toEqual([
      ['fighter', 'Fighter', 3],
      ['wizard', 'Wizard', 2],
    ]);
    expect(characterLevel(multi.stats)).toBe(5);
    const single = token({ class: 'Rogue', level: 4 });
    expect(classLevels(single, book).map((c) => [c.id, c.level])).toEqual([['rogue', 4]]);
    expect(characterLevel(single.stats)).toBe(4);
    expect(classLevels(token({}), book)).toEqual([]);
  });

  it('reads as "Fighter 3 / Wizard 2"', () => {
    expect(
      classesText({
        classes: [
          { class: 'fighter', level: 3 },
          { class: 'wizard', level: 2 },
        ],
      }),
    ).toBe('Fighter 3 / Wizard 2');
    expect(classesText({ class: 'rogue', level: 4 })).toBe('Rogue');
    expect(classesText({})).toBeUndefined();
    expect(classesText(undefined)).toBeUndefined();
  });

  it('flags a token that names both', () => {
    const both = token({ class: 'fighter', level: 1, classes: [{ class: 'wizard', level: 1 }] });
    expect(dnd5e.tokenIssues(both, '2014')).toContainEqual(expect.stringMatching(/classes or class/));
  });
});

describe('a multiclassed creature', () => {
  const fighterWizard = token({
    classes: [
      { class: 'fighter', level: 5 },
      { class: 'wizard', level: 3 },
    ],
    abilities,
    spells: ['fire-bolt'],
  });

  it('takes proficiency, hit points and saves from its classes', () => {
    const sheet = resolveCreature(fighterWizard, book)!;
    expect(sheet.proficiency).toBe(3);
    // Fighter: 10 + 2, then 4 × (6 + 2); wizard: 3 × (4 + 2).
    expect(sheet.maxHp).toBe(12 + 32 + 18);
    expect(sheet.saves.str).toBe(6);
    expect(sheet.saves.int).toBe(3);
  });

  it('gets each class’s features at that class’s level', () => {
    const sheet = resolveCreature(fighterWizard, book)!;
    const ids = sheet.features.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(['second-wind', 'action-surge', 'extra-attack', 'arcane-recovery']));
    expect(ids).not.toContain('indomitable');
    expect(sheet.attacksPerAction).toBe(2);
    expect(sheet.features.find((f) => f.id === 'action-surge')?.classLevel).toBe(5);
    expect(sheet.features.find((f) => f.id === 'arcane-recovery')?.classLevel).toBe(3);
  });

  it('scales sneak attack with rogue levels only', () => {
    const sheet = resolveCreature(
      token({
        classes: [
          { class: 'fighter', level: 4 },
          { class: 'rogue', level: 3 },
        ],
      }),
      book,
    )!;
    expect(sheet.sneakAttack).toBe('2d6');
  });
});

describe('multiclass spellcasting', () => {
  it('adds caster levels for slots, halving paladins and rangers (rounded down in 2014, up in 2024)', () => {
    const t = token({
      classes: [
        { class: 'paladin', level: 3 },
        { class: 'sorcerer', level: 3 },
      ],
    });
    const old = casterSheet(t, basics, book)!;
    expect(old.slots.slice(0, 3)).toEqual([4, 3, 0]);
    expect(old.level).toBe(6);
    const now = casterSheet({ ...t, stats: { ...t.stats, rules: '2024' } }, basics, srdFor('2024'))!;
    expect(now.slots.slice(0, 3)).toEqual([4, 3, 2]);
  });

  it('keeps a single class on its own table', () => {
    const paladin = casterSheet(token({ classes: [{ class: 'paladin', level: 5 }] }), basics, book)!;
    expect(paladin.slots.slice(0, 2)).toEqual([4, 2]);
  });

  it('adds pact slots apart, coming back on a short rest', () => {
    const t = token({
      classes: [
        { class: 'warlock', level: 2 },
        { class: 'cleric', level: 1 },
      ],
    });
    const sheet = casterSheet(t, basics, book)!;
    expect(sheet.slots.slice(0, 2)).toEqual([4, 0]);
    expect(sheet.pactSlots?.slice(0, 2)).toEqual([2, 0]);
    expect(sheet.pact).toBe(false);
    expect(sheet.ability).toBe('cha');
  });

  it('counts no slots for classes below the level their spellcasting starts', () => {
    const t = token({
      classes: [
        { class: 'fighter', level: 3 },
        { class: 'ranger', level: 1 },
      ],
    });
    expect(casterSheet(t, basics, book)?.slots.every((n) => n === 0)).toBe(true);
    const mixed = token({
      classes: [
        { class: 'wizard', level: 3 },
        { class: 'ranger', level: 1 },
      ],
    });
    expect(casterSheet(mixed, basics, book)?.slots.slice(0, 2)).toEqual([4, 2]);
  });
});

describe('hit dice of several classes', () => {
  const t = token(
    {
      classes: [
        { class: 'fighter', level: 2 },
        { class: 'wizard', level: 1 },
      ],
      abilities,
    },
    { hp: 5 },
  );

  it('keeps one pool per die and spends the biggest first', () => {
    const sheet = resolveCreature(t, book)!;
    expect(hitDiceOf(t, sheet)).toMatchObject({ total: 3, left: 3, die: 10 });
    expect(hitDiceOf(t, sheet)?.dice).toEqual([
      { die: 10, total: 2, left: 2 },
      { die: 6, total: 1, left: 1 },
    ]);
    const once = spendHitDie(t, sheet, () => 0).token;
    const twice = spendHitDie(once, resolveCreature(once, book)!, () => 0).token;
    expect(hitDiceOf(twice, sheet)).toMatchObject({ left: 1, die: 6 });
  });
});

describe('multiclass prerequisites', () => {
  it('needs 13 in the new class’s abilities and the current ones', () => {
    const weak = { ...abilities, cha: 12 };
    expect(multiclassProblem(weak, ['fighter'], 'sorcerer', book)).toMatch(/Charisma 13/);
    expect(multiclassProblem(abilities, ['fighter'], 'sorcerer', book)).toBeUndefined();
    expect(multiclassProblem({ ...abilities, str: 12, dex: 12 }, ['wizard'], 'fighter', book)).toMatch(
      /Strength or Dexterity 13/,
    );
    expect(multiclassProblem({ ...abilities, int: 12 }, ['wizard'], 'fighter', book)).toMatch(/Intelligence 13/);
    expect(multiclassProblem({ ...abilities, wis: 12 }, ['fighter'], 'monk', book)).toMatch(/Wisdom 13/);
  });
});
