import { describe, expect, it } from 'vitest';
import { gameCompendia } from './homebrew.ts';
import { gameSkills, skillAbility } from './game-skills.ts';
import { contentWith } from './packs.ts';
import { srdFor } from './content.ts';
import { checkBonus } from './checks.ts';
import { skillCheck } from './game-skills.ts';

// A campaign's own skills (Psychic Resistance, Wisdom): a homebrew document
// of kind "skill" or a pack's `skill` compendium, listed after the 18.

const psychic = { id: 'psychic-resistance', kind: 'skill', name: 'Psychic Resistance', ability: 'wis' };

describe('game skills', () => {
  it('are the 18 skills when the game adds none', () => {
    const skills = gameSkills(srdFor('2014'));
    expect(skills).toHaveLength(18);
    expect(skills[0]).toEqual({ id: 'acrobatics', name: 'Acrobatics', ability: 'dex' });
  });

  it('add a homebrew skill after the 18, with its ability', () => {
    const content = contentWith('2014', gameCompendia({}, [], [psychic]));
    const skills = gameSkills(content);
    expect(skills).toHaveLength(19);
    expect(skills.at(-1)).toEqual({ id: 'psychic-resistance', name: 'Psychic Resistance', ability: 'wis' });
    expect(skillAbility(content, 'psychic-resistance')).toBe('wis');
    expect(skillAbility(content, 'stealth')).toBe('dex');
  });

  it('use Wisdom when the skill names no ability', () => {
    const { ability: _a, ...bare } = psychic;
    const content = contentWith('2024', gameCompendia({}, [], [bare]));
    expect(skillAbility(content, 'psychic-resistance')).toBe('wis');
  });

  it('come from a pack compendium of type skill too', () => {
    const compendium = {
      id: 'skills',
      name: 'Skills',
      type: 'skill',
      path: 'skills.json',
      pack: 'cursed-lands',
      docs: [{ id: 'psychic-resistance', name: 'Psychic Resistance' }],
    };
    expect(gameSkills(contentWith('2014', [compendium])).map((s) => s.id)).toContain('psychic-resistance');
  });
});

describe('a skill with no ability', () => {
  const free = { id: 'psychic-resistance', kind: 'skill', name: 'Psychic Resistance', ability: 'none' };
  const content = contentWith('2014', gameCompendia({}, [], [free]));
  const sheet = {
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 18, cha: 10 },
    proficiency: 3,
    saves: {},
  } as never;

  it('is listed as free', () => {
    expect(gameSkills(content).at(-1)).toMatchObject({ id: 'psychic-resistance', ability: 'none' });
    expect(skillAbility(content, 'psychic-resistance')).toBe('none');
  });

  it("rolls the character's typed bonus, not an ability and proficiency", () => {
    const check = skillCheck(gameSkills(content).at(-1)!);
    const token = { stats: { skills: ['psychic-resistance'], skillValues: { 'psychic-resistance': 7 } } };
    expect(checkBonus(token, sheet, check)).toBe(7);
    expect(checkBonus({ stats: {} }, sheet, check)).toBe(0);
  });
});

describe("a character's own ability for a campaign skill", () => {
  const def = { id: 'psychic-resistance', name: 'Psychic Resistance', ability: 'wis' as const };

  it('replaces the default one', () => {
    expect(skillCheck(def, { skillAbilities: { 'psychic-resistance': 'cha' } })).toEqual({
      ability: 'cha',
      skill: 'psychic-resistance',
    });
    expect(skillCheck(def, { skillAbilities: { 'psychic-resistance': 'none' } })).toMatchObject({ free: true });
    expect(skillCheck(def, {})).toEqual({ ability: 'wis', skill: 'psychic-resistance' });
  });
});
