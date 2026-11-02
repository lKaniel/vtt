import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { formChoices, formProblem, withForm } from './forms.ts';
import { type Token, TokenSchema } from './token-schema.ts';
import type { Effect } from './spell-schema.ts';
import type { Edition } from './stats-schema.ts';

// Shape-shifting: polymorph and its kin turn a creature into another stat
// block. 2014 forms bring their own hit points; 2024 forms give temporary ones.

const content = (e: Edition) => srdFor(e);
const spell = (e: Edition, id: string) => content(e).spells.get(id)!;
const wizard = (rules: Edition, effects: Effect[] = [], extra: Partial<Token> = {}) =>
  TokenSchema.parse({
    id: 'wiz',
    name: 'Wizard',
    x: 50,
    y: 50,
    stats: { class: 'wizard', level: 5, rules, maxHp: 30, abilities: { int: 18, wis: 12, cha: 10 } },
    effects,
    ...extra,
  });
const goblin = TokenSchema.parse({ id: 'gob', name: 'Goblin', x: 150, y: 50, monster: 'goblin' });
const bear = (hp: 'replace' | 'temp', keepMind = false): Effect => ({
  id: 'polymorph-x',
  name: 'Polymorphed',
  form: { monster: 'brown-bear', hp, ...(keepMind && { keepMind }) },
});

describe('which forms a spell allows', () => {
  it('polymorph offers beasts only', () => {
    const forms = formChoices(spell('2014', 'polymorph'), content('2014'), 5);
    expect(forms.length).toBeGreaterThan(20);
    expect(forms.every((m) => m.type === 'beast')).toBe(true);
  });

  it('shapechange offers any creature up to the caster’s level, but not constructs or undead', () => {
    const forms = formChoices(spell('2014', 'shapechange'), content('2014'), 17);
    expect(forms.some((m) => m.type === 'dragon')).toBe(true);
    expect(forms.some((m) => m.type === 'undead' || m.type === 'construct')).toBe(false);
    expect(Math.max(...forms.map((m) => m.cr))).toBeLessThanOrEqual(17);
  });

  it('animal shapes offers Large or smaller beasts of challenge 4 or lower', () => {
    const forms = formChoices(spell('2014', 'animal-shapes'), content('2014'), 15);
    expect(forms.every((m) => m.cr <= 4 && m.size <= 2)).toBe(true);
  });

  it('refuses a form above the target’s challenge rating or level', () => {
    const s = spell('2014', 'polymorph');
    const books = content('2014');
    expect(
      formProblem(s, books.monsters.get('brown-bear'), { target: goblin, casterLevel: 7, content: books }),
    ).toMatch(/challenge/);
    expect(
      formProblem(s, books.monsters.get('cat'), { target: goblin, casterLevel: 7, content: books }),
    ).toBeUndefined();
    expect(formProblem(s, books.monsters.get('goblin'), { target: goblin, casterLevel: 7, content: books })).toMatch(
      /beast/,
    );
  });
});

describe('a creature in another form', () => {
  it('2014: takes the form’s whole stat block, hit points included', () => {
    const sheet = resolveCreature(wizard('2014', [bear('replace')]), content('2014'))!;
    expect(sheet).toMatchObject({ ac: 11, maxHp: 34, type: 'beast' });
    expect(sheet.abilities.int).toBe(2);
    expect(sheet.attacks.map((a) => a.name)).toContain('Claws');
    expect(sheet.caster).toBeUndefined();
  });

  it('keeps its own mind when the spell says so (shapechange, animal shapes)', () => {
    const sheet = resolveCreature(wizard('2014', [bear('replace', true)]), content('2014'))!;
    expect(sheet.abilities.int).toBe(18);
  });

  it('2024: keeps its own hit points', () => {
    const sheet = resolveCreature(wizard('2024', [bear('temp')]), content('2024'))!;
    expect(sheet).toMatchObject({ ac: 11, maxHp: 30 });
  });
});

describe('changing shape and back', () => {
  const bearHp = () => 34;

  it('2014: puts its own hit points aside and takes the form’s, then gets them back', () => {
    const changed = withForm(wizard('2014', [bear('replace')], { hp: 12 }), bearHp)!;
    expect(changed).toMatchObject({ hp: undefined, trueForm: { hp: 12, mode: 'replace' } });
    const back = withForm({ ...changed, hp: 5, effects: [] }, bearHp)!;
    expect(back).toMatchObject({ hp: 12, trueForm: undefined });
  });

  it('2024: gains the form’s hit points as temporary ones, and the spell ends when they are gone', () => {
    const changed = withForm(wizard('2024', [bear('temp')], { tempHp: 3 }), bearHp)!;
    expect(changed).toMatchObject({ tempHp: 34, trueForm: { mode: 'temp' } });
    const spent = withForm({ ...changed, tempHp: undefined }, bearHp)!;
    expect(spent).toMatchObject({ effects: [], trueForm: undefined });
  });

  it('leaves a creature in no form alone', () => {
    expect(withForm(wizard('2014'), bearHp)).toBeUndefined();
  });
});
