import { describe, expect, it } from 'vitest';
import { abilityScores, type Character, CharacterSchema, characterSkills, characterToken } from './character.ts';
import { characterIssues, issuesByStep } from './character-check.ts';
import { checkBonus } from './checks.ts';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { TokenSchema } from './token-schema.ts';

// Custom options in the creator: a species and a background the player
// describes, and proficiencies beyond what the class and background give.

function hero(over: Partial<Character> = {}): Character {
  return CharacterSchema.parse({
    id: 'nyx',
    owner: 'kaniel',
    name: 'Nyx',
    rules: '2014',
    species: 'custom',
    customSpecies: { name: 'Moth-folk', size: 'small', speed: 25, darkvision: 60, traits: [] },
    class: 'rogue',
    background: 'custom',
    customBackground: { name: 'Lamplighter', skills: ['perception', 'history'] },
    base: { str: 8, dex: 15, con: 14, int: 12, wis: 10, cha: 13 },
    bonusPicks: { dex: 2, con: 1 },
    skills: ['stealth', 'acrobatics', 'deception', 'insight'],
    ...over,
  });
}

describe('custom species', () => {
  it('is what the player describes: size, speed, darkvision and traits', () => {
    const token = characterToken(hero());
    expect(token).toMatchObject({ speed: 25, darkvision: 60 });
    expect(characterIssues(hero())).toEqual([]);
  });

  it('gives +2 and +1 to abilities the player picks (2014)', () => {
    expect(abilityScores(hero())).toMatchObject({ dex: 17, con: 15 });
    expect(issuesByStep(hero({ bonusPicks: { dex: 2 } })).abilities).toEqual([
      'Give one ability +2 and another +1, or three +1.',
    ]);
  });

  it('needs a name', () => {
    const nameless = hero({ customSpecies: undefined });
    expect(issuesByStep(nameless).species).toEqual(['Describe your custom species.']);
  });
});

describe('custom background', () => {
  it('gives the two skills the player picks', () => {
    expect(characterSkills(hero())).toEqual(expect.arrayContaining(['perception', 'history']));
    const one = hero({ customBackground: { name: 'Lamplighter', skills: ['perception'] } });
    expect(issuesByStep(one).background).toEqual(['Choose 2 background skills.']);
  });

  it('raises three abilities the player picks (2024)', () => {
    const c = hero({
      rules: '2024',
      customSpecies: { name: 'Moth-folk', size: 'small', speed: 30, darkvision: 0, traits: [] },
      customBackground: { name: 'Lamplighter', skills: ['perception', 'history'], abilities: ['dex', 'con', 'wis'] },
      bonusPicks: { dex: 2, con: 1 },
      skills: ['stealth', 'acrobatics', 'deception', 'insight'],
    });
    expect(issuesByStep(c).abilities).toEqual([]);
    expect(issuesByStep({ ...c, bonusPicks: { str: 2, con: 1 } }).abilities).toEqual([
      'Lamplighter raises only Dexterity, Constitution and Wisdom.',
    ]);
    const noAbilities = CharacterSchema.parse({
      ...c,
      customBackground: { name: 'Lamplighter', skills: ['perception', 'history'] },
    });
    expect(issuesByStep(noAbilities).background).toEqual(['Choose 3 abilities your background raises.']);
  });
});

describe('custom proficiencies', () => {
  it('adds skills, expertise and other proficiencies to the token', () => {
    const c = hero({ extraSkills: ['survival'], expertise: ['stealth'], proficiencies: ['Thieves’ tools', 'Elvish'] });
    expect(characterIssues(c)).toEqual([]);
    const stats = characterToken(c).stats!;
    expect(stats.skills).toContain('survival');
    expect(stats.expertise).toEqual(['stealth']);
    expect(stats.proficiencies).toEqual(['Thieves’ tools', 'Elvish']);
  });

  it('expertise needs proficiency in the skill', () => {
    expect(issuesByStep(hero({ expertise: ['arcana'] })).skills).toEqual(['Expertise needs proficiency in Arcana.']);
  });
});

describe('checks with expertise and jack of all trades', () => {
  const book = srdFor('2014');
  const token = (stats: object) =>
    TokenSchema.parse({ id: 'h', name: 'H', x: 0, y: 0, stats: { abilities: { dex: 14 }, ...stats } });

  it('expertise doubles proficiency', () => {
    const t = token({ class: 'rogue', level: 1, skills: ['stealth'], expertise: ['stealth'] });
    expect(checkBonus(t, resolveCreature(t, book)!, { ability: 'dex', skill: 'stealth' })).toBe(6);
  });

  it('a bard adds half proficiency to checks without proficiency', () => {
    const t = token({ class: 'bard', level: 2 });
    expect(checkBonus(t, resolveCreature(t, book)!, { ability: 'dex', skill: 'acrobatics' })).toBe(3);
    expect(checkBonus(t, resolveCreature(t, book)!, { ability: 'dex' })).toBe(3);
    const one = token({ class: 'bard', level: 1 });
    expect(checkBonus(one, resolveCreature(one, book)!, { ability: 'dex' })).toBe(2);
  });
});
