import { CharacterSchema, characterIssues, levelUp, newCharacter, type Character } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import {
  adjustPointBuy,
  assignStandard,
  chooseBackground,
  chooseClass,
  chooseSpecies,
  creatorSteps,
  characterSummary,
  levelUpPlan,
  pointsLeft,
  rollAbilityScores,
  setBackgroundBonus,
  setEdition,
  spellChoices,
  toggleBonusChoice,
  toggleSkill,
  toggleSpell,
} from './creator.ts';
import { parseRoute, routeHash } from './route.ts';

const fresh = (rules: '2014' | '2024' = '2014') => newCharacter({ id: 'new', owner: 'me', rules });

describe('routes', () => {
  it('reads and writes the screens in the address bar', () => {
    expect(parseRoute('')).toEqual({ name: 'menu' });
    expect(parseRoute('#/login')).toEqual({ name: 'login' });
    expect(parseRoute('#/edit/vex-1a2b')).toEqual({ name: 'create', id: 'vex-1a2b' });
    expect(parseRoute('#/level/vex-1a2b')).toEqual({ name: 'levelup', id: 'vex-1a2b' });
    expect(parseRoute('#/nonsense')).toEqual({ name: 'menu' });
    for (const hash of [
      '#/',
      '#/login',
      '#/register',
      '#/account',
      '#/create',
      '#/edit/x',
      '#/level/x',
      '#/seats',
      '#/play',
    ]) {
      expect(routeHash(parseRoute(hash))).toBe(hash);
    }
  });
});

describe('choosing origins and class', () => {
  it('clears the subrace and picked bonuses when the species changes', () => {
    const elf = chooseSpecies({ ...fresh(), subspecies: 'x', bonusPicks: { str: 1 } }, 'elf');
    expect(elf).toMatchObject({ species: 'elf', subspecies: undefined, bonusPicks: {} });
  });

  it('picks the only size, or leaves a choice open', () => {
    expect(chooseSpecies(fresh('2024'), 'dwarf').size).toBe('medium');
    expect(chooseSpecies(fresh('2024'), 'tiefling').size).toBeUndefined();
  });

  it('clears class picks when the class changes', () => {
    const c = chooseClass({ ...fresh(), skills: ['athletics'], spells: ['x'], kit: { a: 'b' } }, 'wizard');
    expect(c).toMatchObject({ class: 'wizard', skills: [], spells: [], kit: {} });
  });

  it('drops class skills the new background already gives', () => {
    const c = chooseBackground({ ...fresh(), skills: ['insight', 'athletics'] }, 'acolyte');
    expect(c.skills).toEqual(['athletics']);
  });

  it('starts over in the other edition, keeping the name', () => {
    const c = setEdition({ ...fresh(), name: 'Vex' }, '2024');
    expect(c).toMatchObject({ rules: '2024', name: 'Vex', background: 'acolyte' });
  });
});

describe('ability scores', () => {
  it('spends and refunds point buy within 8 to 15 and the budget', () => {
    let c: Character = { ...fresh(), method: 'point-buy', base: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 } };
    expect(pointsLeft(c)).toBe(27);
    c = adjustPointBuy(c, 'str', 1);
    expect(c.base.str).toBe(9);
    expect(pointsLeft(c)).toBe(26);
    expect(adjustPointBuy(c, 'dex', -1).base.dex).toBe(8);
    const maxed = { ...c, base: { str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 } };
    expect(adjustPointBuy(maxed, 'int', 1).base.int).toBe(8);
  });

  it('swaps standard array scores between abilities', () => {
    const c = assignStandard(fresh(), 'cha', 15);
    expect(c.base).toMatchObject({ str: 8, cha: 15 });
  });

  it('rolls 4d6 and keeps the best three for each ability', () => {
    const scores = rollAbilityScores(() => 0.99);
    expect(Object.values(scores)).toEqual([18, 18, 18, 18, 18, 18]);
    expect(Object.values(rollAbilityScores(() => 0))).toEqual([3, 3, 3, 3, 3, 3]);
  });

  it('picks the half-elf bonuses up to the count', () => {
    let c = chooseSpecies(fresh(), 'half-elf');
    c = toggleBonusChoice(toggleBonusChoice(toggleBonusChoice(c, 'str'), 'dex'), 'con');
    expect(c.bonusPicks).toEqual({ str: 1, dex: 1 });
    expect(toggleBonusChoice(c, 'str').bonusPicks).toEqual({ dex: 1 });
  });

  it('sets the 2024 background bonuses', () => {
    const c = fresh('2024');
    expect(setBackgroundBonus(c, { plus2: 'wis', plus1: 'cha' }).bonusPicks).toEqual({ wis: 2, cha: 1 });
    expect(setBackgroundBonus(c, 'each').bonusPicks).toEqual({ int: 1, wis: 1, cha: 1 });
  });
});

describe('skills and spells', () => {
  it('toggles class skills up to the number allowed', () => {
    let c = fresh();
    c = toggleSkill(toggleSkill(toggleSkill(c, 'athletics'), 'history'), 'survival');
    expect(c.skills).toEqual(['athletics', 'history']);
    expect(toggleSkill(c, 'athletics').skills).toEqual(['history']);
  });

  it('offers the class spells a character can learn, and limits picks', () => {
    const c = chooseClass(fresh(), 'wizard');
    const choices = spellChoices(c);
    expect(choices.limits).toMatchObject({ cantrips: 3, spells: 6, maxLevel: 1 });
    expect(choices.cantrips.map((s) => s.id)).toContain('fire-bolt');
    expect(choices.spells.every((s) => s.level === 1)).toBe(true);
    let picked = c;
    for (const id of ['fire-bolt', 'light', 'mage-hand', 'ray-of-frost']) picked = toggleSpell(picked, id);
    expect(picked.spells).toEqual(['fire-bolt', 'light', 'mage-hand']);
  });
});

describe('creatorSteps', () => {
  it('lists the steps with their issues, and skips spells for classes without them', () => {
    const fighter = creatorSteps(fresh());
    expect(fighter.map((s) => s.id)).not.toContain('spells');
    expect(fighter.find((s) => s.id === 'skills')?.issues).toEqual(['Choose 2 class skills.']);
    const wizard = creatorSteps(chooseClass(fresh(), 'wizard'));
    expect(wizard.map((s) => s.id)).toContain('spells');
    expect(wizard.find((s) => s.id === 'spells')?.issues).toEqual(['Pick 3 more cantrips and 6 more spells.']);
  });
});

describe('levelUpPlan', () => {
  const wizard = CharacterSchema.parse({
    ...fresh('2024'),
    class: 'wizard',
    background: 'sage',
    base: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
    bonusPicks: { int: 2, con: 1 },
    skills: ['arcana', 'medicine'],
    spells: ['fire-bolt', 'light', 'mage-hand', 'magic-missile', 'shield', 'sleep', 'mage-armor'],
  });

  it('says what the next level brings', () => {
    expect(characterIssues(wizard)).toEqual([]);
    expect(levelUpPlan(wizard)).toMatchObject({ level: 2, hitDie: 6, average: 4, improvement: false, subclass: false });
    const two = levelUp(wizard, { hp: 4, spells: [...wizard.spells, 'burning-hands'] });
    expect(levelUpPlan(two)).toMatchObject({ level: 3, subclass: true, newSpells: 1 });
    const three = { ...two, level: 3, hpRolls: [4, 4], subclass: 'evoker' };
    expect(levelUpPlan(three)).toMatchObject({ level: 4, improvement: true, newCantrips: 1 });
  });
});

describe('characterSummary', () => {
  it('names the level, species and class', () => {
    expect(characterSummary({ ...chooseSpecies(fresh(), 'dwarf'), subspecies: 'hill-dwarf' })).toBe(
      'Level 1 Hill dwarf Fighter',
    );
  });
});
