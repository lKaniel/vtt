import { describe, expect, it } from 'vitest';
import { type Character, CharacterSchema, characterToken, partsOf } from './character.ts';
import { characterIssues, issuesByStep } from './character-check.ts';
import { checkBonus } from './checks.ts';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { castProblem } from './spells.ts';
import { TokenSchema } from './token-schema.ts';
import {
  characterProficiencies,
  proficiencyChoices,
  proficiencyName,
  toProficiency,
  proficiencyOptions,
} from './proficiencies.ts';

// Tools, languages, armor and weapons: granted by class, species and
// background, picked where they offer a choice, and used by the rules.

function hero(over: Partial<Character> = {}): Character {
  return CharacterSchema.parse({
    id: 'thorin',
    owner: 'kaniel',
    name: 'Thorin',
    rules: '2014',
    species: 'dwarf',
    subspecies: 'hill-dwarf',
    class: 'fighter',
    background: 'acolyte',
    base: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
    skills: ['athletics', 'perception'],
    features: ['fighter/defense'],
    proficiencyPicks: { 'species:tools': ['smiths-tools'], 'background:languages': ['elvish', 'giant'] },
    ...over,
  });
}

const book = srdFor('2014');
const withParts = (c: Character) => [c, partsOf(c)] as const;

function tokenOf(c: Character, inventory: { item: string; equipped: boolean }[] = []) {
  return TokenSchema.parse({ id: 't', x: 0, y: 0, ...characterToken(c), inventory });
}

describe('proficiency names', () => {
  it('reads old free-text words as known proficiencies', () => {
    expect(toProficiency('Thieves’ tools')).toBe('thieves-tools');
    expect(toProficiency('Light armor')).toBe('light-armor');
    expect(toProficiency('elvish')).toBe('elvish');
    expect(toProficiency('Shield')).toBe('shields');
    expect(toProficiency('Juggling')).toBe('Juggling');
  });

  it('names ids for the sheet, and words as they were written', () => {
    expect(proficiencyName('thieves-tools', book)).toBe("Thieves' Tools");
    expect(proficiencyName('longsword', book)).toBe('Longsword');
    expect(proficiencyName('Juggling', book)).toBe('Juggling');
  });

  it('offers every armor, weapon, tool and language to pick', () => {
    const kinds = new Set(proficiencyOptions(book).map((o) => o.kind));
    expect([...kinds]).toEqual(['armor', 'weapon', 'tool', 'language']);
    expect(proficiencyOptions(book).some((o) => o.id === 'hand-crossbow')).toBe(true);
  });
});

describe('granted and picked proficiencies', () => {
  it('collects the class, species and background grants with the picks', () => {
    const list = characterProficiencies(...withParts(hero()));
    expect(list).toEqual(
      expect.arrayContaining(['heavy-armor', 'shields', 'martial-weapons', 'battleaxe', 'common', 'dwarvish']),
    );
    expect(list).toEqual(expect.arrayContaining(['smiths-tools', 'elvish', 'giant']));
  });

  it('lists the choices still to make, with what they may pick', () => {
    const choices = proficiencyChoices(...withParts(hero({ proficiencyPicks: {} })));
    const tools = choices.find((c) => c.key === 'species:tools');
    expect(tools?.options).toEqual(['smiths-tools', 'brewers-supplies', 'masons-tools']);
    const languages = choices.find((c) => c.key === 'background:languages');
    expect(languages?.pick).toBe(2);
    expect(languages?.options).not.toContain('dwarvish');
    expect(languages?.options).not.toContain('thieves-cant');
  });

  it('asks for every pick before the character can be saved', () => {
    expect(characterIssues(hero())).toEqual([]);
    expect(issuesByStep(hero({ proficiencyPicks: {} })).skills).toEqual([
      'Choose 1 tool (Dwarf).',
      'Choose 2 languages (Acolyte).',
    ]);
    const wrong = hero({
      proficiencyPicks: { 'species:tools': ['thieves-tools'], 'background:languages': ['elvish'] },
    });
    expect(issuesByStep(wrong).skills).toContain('Choose 1 tool (Dwarf).');
  });

  it('puts them on the token, custom ones last', () => {
    const stats = characterToken(hero({ proficiencies: ['Juggling'] })).stats!;
    expect(stats.proficiencies).toContain('heavy-armor');
    expect(stats.proficiencies?.at(-1)).toBe('Juggling');
  });

  it('gives 2024 characters Common and two standard languages', () => {
    const c = hero({ rules: '2024', species: 'dwarf', subspecies: undefined, size: 'medium', proficiencyPicks: {} });
    const languages = proficiencyChoices(...withParts(c)).find((x) => x.key === 'base:languages');
    expect(languages?.pick).toBe(2);
    expect(languages?.options).toContain('draconic');
    expect(languages?.options).not.toContain('abyssal');
    expect(characterProficiencies(c, partsOf(c))).toContain('common');
  });

  it('gives a new class only its multiclass proficiencies', () => {
    const c = hero({
      class: 'wizard',
      multiclass: [{ class: 'fighter', level: 1 }],
      base: { ...hero().base, int: 13 },
    });
    const list = characterProficiencies(c, partsOf(c));
    expect(list).toEqual(expect.arrayContaining(['light-armor', 'medium-armor', 'shields', 'martial-weapons']));
    expect(list).not.toContain('heavy-armor');
  });
});

describe('proficiencies at work', () => {
  it('adds the proficiency bonus only to weapons the character is trained with', () => {
    const wizard = hero({ class: 'wizard', skills: ['arcana', 'history'], spells: [] });
    const sheet = resolveCreature(tokenOf(wizard, [{ item: 'longsword', equipped: true }]), book)!;
    const fighter = resolveCreature(tokenOf(hero(), [{ item: 'longsword', equipped: true }]), book)!;
    const sword = (s: typeof sheet) => s.attacks.find((a) => a.name === 'Longsword')!.toHit;
    expect(sword(fighter) - sword(sheet)).toBe(2);
  });

  it('counts a species weapon: a dwarf wizard swings a battleaxe well', () => {
    const wizard = hero({ class: 'wizard', skills: ['arcana', 'history'], spells: [] });
    const sheet = resolveCreature(tokenOf(wizard, [{ item: 'battleaxe', equipped: true }]), book)!;
    expect(sheet.attacks.find((a) => a.name === 'Battleaxe')!.toHit).toBe(2 + 2);
  });

  it('hinders a character in armor it is not trained with and stops its spells', () => {
    const wizard = hero({ class: 'wizard', skills: ['arcana', 'history'], spells: ['magic-missile'] });
    const sheet = resolveCreature(tokenOf(wizard, [{ item: 'plate', equipped: true }]), book)!;
    const untrained = sheet.effects.find((e) => e.id === 'untrained-armor');
    expect(untrained).toMatchObject({ disadvantage: true, checkDisadvantageFor: ['str', 'dex'] });
    const spell = book.spells.get('magic-missile')!;
    expect(castProblem({ spell, slot: 1, sheet })).toMatch(/can't cast Magic Missile/);
    const fighter = resolveCreature(tokenOf(hero(), [{ item: 'plate', equipped: true }]), book)!;
    expect(fighter.effects.some((e) => e.id === 'untrained-armor')).toBe(false);
  });

  it('adds proficiency to checks with a tool the character is trained with', () => {
    const token = tokenOf(hero());
    const sheet = resolveCreature(token, book)!;
    expect(checkBonus(token, sheet, { ability: 'str', tool: 'smiths-tools' })).toBe(2 + 2);
    expect(checkBonus(token, sheet, { ability: 'str', tool: 'masons-tools' })).toBe(2);
  });

  it('leaves monsters proficient with whatever they carry', () => {
    const orc = TokenSchema.parse({
      id: 'o',
      name: 'Orc',
      x: 0,
      y: 0,
      monster: 'orc',
      inventory: [{ item: 'plate', equipped: true }],
    });
    expect(resolveCreature(orc, book)!.effects.some((e) => e.id === 'untrained-armor')).toBe(false);
  });
});
