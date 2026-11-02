import { describe, expect, it } from 'vitest';
import { characterIssues } from './character-check.ts';
import { characterOnMap } from './character-token.ts';
import { type Character, CharacterSchema, characterMaxHp, partsOf } from './character.ts';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { homebrewCompendia } from './homebrew.ts';
import { withOwn } from './own-content.ts';
import { contentWith } from './packs.ts';
import { ClassSchema } from './spell-schema.ts';

// A roster character in a GM's homebrew class: the class is copied onto the
// character, so it is built and checked like an SRD one, and goes with its
// token into any game.

const illusionist = ClassSchema.parse({
  id: 'illusionist',
  name: 'Illusionist',
  hitDie: 10,
  saves: ['int', 'wis'],
  subclassLevel: 3,
  subclasses: [{ id: 'dreamer', name: 'Dreamer', description: 'Dreams.', features: [] }],
  features: [{ id: 'weave', name: 'Weave', level: 1 }],
});

function hero(over: Partial<Character> = {}): Character {
  return CharacterSchema.parse({
    id: 'nyx',
    owner: 'kaniel',
    name: 'Nyx',
    rules: '2014',
    species: 'human',
    class: 'illusionist',
    background: 'acolyte',
    base: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
    skills: ['arcana', 'stealth'],
    homebrew: [illusionist],
    ...over,
  });
}

describe('a character in a homebrew class', () => {
  it('is built from the class it carries', () => {
    const p = partsOf(hero());
    expect(p.cls?.name).toBe('Illusionist');
    expect(p.options).toMatchObject({ subclassLevel: 3, skills: { pick: 2 } });
    expect(p.options?.subclasses.map((s) => s.id)).toEqual(['dreamer']);
    expect(characterMaxHp(hero())).toBe(10 + 2); // human: Con 13 + 1
    expect(characterIssues(hero())).toEqual([]);
  });

  it('is an unknown class without it', () => {
    expect(characterIssues(hero({ homebrew: [] }))).toEqual(['Unknown class "illusionist".']);
  });

  it('asks for the subclass at its level', () => {
    expect(characterIssues(hero({ level: 3, hpRolls: [6, 6] }))).toContain('Choose a Illusionist subclass.');
  });

  it('brings the class to the map, where the game’s own copy wins', () => {
    const token = characterOnMap(hero(), undefined, [0, 0]);
    expect(token.own?.classes?.map((k) => k.id)).toEqual(['illusionist']);
    expect(resolveCreature(token, withOwn(srdFor('2014'), token))?.maxHp).toBe(12);
    const game = contentWith('2014', homebrewCompendia([{ ...illusionist, kind: 'class', hitDie: 6 }]));
    expect(withOwn(game, token).classes.get('illusionist')?.hitDie).toBe(6);
  });
});
