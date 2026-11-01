import { describe, expect, it } from 'vitest';
import {
  abilityScores,
  characterInventory,
  characterMaxHp,
  CharacterSchema,
  characterSkills,
  characterToken,
  kitItems,
  newCharacter,
  type Character,
} from './character.ts';
import { characterIssues, issuesByStep, levelUp } from './character-check.ts';
import type { KitStep } from './origins.ts';

/** A valid level 1 2014 hill dwarf cleric. */
function cleric(over: Partial<Character> = {}): Character {
  return CharacterSchema.parse({
    id: 'tordek',
    owner: 'kaniel',
    name: 'Tordek',
    rules: '2014',
    species: 'dwarf',
    subspecies: 'hill-dwarf',
    class: 'cleric',
    subclass: 'life-domain',
    background: 'acolyte',
    base: { str: 14, dex: 8, con: 15, int: 8, wis: 15, cha: 10 },
    skills: ['medicine', 'history'],
    spells: ['guidance', 'sacred-flame', 'light', 'cure-wounds', 'bless'],
    ...over,
  });
}

/** A valid level 1 2024 human wizard with a sage background. */
function wizard(over: Partial<Character> = {}): Character {
  return CharacterSchema.parse({
    id: 'mira',
    owner: 'kaniel',
    name: 'Mira',
    rules: '2024',
    species: 'human',
    size: 'medium',
    class: 'wizard',
    background: 'sage',
    base: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
    bonusPicks: { int: 2, con: 1 },
    skills: ['investigation', 'medicine'],
    spells: ['fire-bolt', 'light', 'mage-hand', 'magic-missile', 'shield', 'sleep', 'mage-armor'],
    ...over,
  });
}

describe('abilityScores', () => {
  it('adds species and subspecies bonuses (2014)', () => {
    expect(abilityScores(cleric())).toMatchObject({ con: 17, wis: 16 });
  });

  it('adds the background bonuses picked (2024)', () => {
    expect(abilityScores(wizard())).toMatchObject({ int: 17, con: 14 });
  });

  it('adds ability score improvements, capped at 20', () => {
    expect(abilityScores(cleric({ improvements: [{ wis: 2 }, { wis: 2 }, { wis: 2 }] })).wis).toBe(20);
  });
});

describe('characterMaxHp', () => {
  it('takes the full die at level 1, then the rolls, each with Constitution, plus dwarven toughness', () => {
    // d8 + 3 at level 1, then 5 + 3, plus 1 per level for the hill dwarf.
    expect(characterMaxHp(cleric())).toBe(12);
    expect(characterMaxHp(cleric({ level: 2, hpRolls: [5] }))).toBe(21);
  });
});

describe('characterSkills', () => {
  it('joins the background skills and the class picks', () => {
    expect(characterSkills(cleric())).toEqual(['insight', 'religion', 'medicine', 'history']);
  });
});

describe('kitItems', () => {
  const steps: KitStep[] = [
    {
      id: 'weapons',
      prompt: '',
      options: [
        { id: 'axe', label: '', items: [{ item: 'handaxe', qty: 2, equipped: true }] },
        { id: 'any', label: '', items: [] },
      ],
    },
    {
      id: 'pick',
      prompt: '',
      when: { step: 'weapons', option: 'any' },
      options: [{ id: 'club', label: '', items: [{ item: 'club', qty: 1, equipped: true }] }],
    },
  ];

  it('takes the first option unless another is picked, and skips steps whose condition fails', () => {
    expect(kitItems(steps, {})).toEqual([{ item: 'handaxe', qty: 2, equipped: true }]);
    expect(kitItems(steps, { weapons: 'any' })).toEqual([{ item: 'club', qty: 1, equipped: true }]);
  });
});

describe('characterInventory', () => {
  it('collects the class and background kits', () => {
    const items = characterInventory(cleric({ kit: { clericWeapon: 'warhammer' } })).map((i) => i.item);
    expect(items).toContain('warhammer');
    expect(items).toContain('scale-mail');
    expect(items).toContain('amulet');
  });
});

describe('characterIssues', () => {
  it('accepts valid characters', () => {
    expect(characterIssues(cleric())).toEqual([]);
    expect(characterIssues(wizard())).toEqual([]);
  });

  it('flags unknown choices', () => {
    expect(characterIssues(cleric({ species: 'kobold' }))).toContain('Unknown species "kobold".');
    expect(characterIssues(cleric({ class: 'artificer' }))).toContain('Unknown class "artificer".');
    expect(characterIssues(cleric({ subspecies: undefined }))).toContain('Choose a subrace for Dwarf.');
  });

  it('checks point buy', () => {
    const base = { str: 15, dex: 15, con: 15, int: 8, wis: 15, cha: 8 };
    expect(characterIssues(cleric({ base }))).toContain('Point buy spends 36 of 27 points.');
    expect(characterIssues(cleric({ base, method: 'manual' }))).toEqual([]);
  });

  it('checks skills', () => {
    expect(characterIssues(cleric({ skills: ['medicine'] }))).toContain('Choose 2 class skills.');
    expect(characterIssues(cleric({ skills: ['medicine', 'stealth'] }))).toContain('Clerics can\'t pick "stealth".');
  });

  it('checks spells: count, class list and level', () => {
    expect(characterIssues(cleric({ spells: ['guidance', 'sacred-flame', 'light', 'thaumaturgy'] }))).toContain(
      'Choose at most 3 cantrips.',
    );
    expect(characterIssues(cleric({ spells: ['guidance', 'fireball'] }))).toContain(
      "Fireball isn't a level 1 or lower cleric spell.",
    );
  });

  it('checks the 2024 background bonus picks', () => {
    expect(characterIssues(wizard({ bonusPicks: { str: 2, con: 1 } }))).toContain(
      'Sage raises only Constitution, Intelligence and Wisdom.',
    );
    expect(characterIssues(wizard({ bonusPicks: { int: 1 } }))).toContain(
      'Give one ability +2 and another +1, or three +1.',
    );
  });

  it('checks hit point rolls and improvements against the level', () => {
    expect(characterIssues(cleric({ level: 2 }))).toContain(
      'Roll or take average hit points for each level after 1st.',
    );
    expect(characterIssues(cleric({ level: 2, hpRolls: [9] }))).toContain("A d8 can't roll 9.");
    expect(characterIssues(cleric({ level: 4, hpRolls: [5, 5, 5] }))).toContain(
      'Take 1 ability score improvement (2 points each).',
    );
  });
});

describe('issuesByStep', () => {
  it('groups the issues by creator step', () => {
    const steps = issuesByStep(cleric({ skills: [], subspecies: undefined }));
    expect(steps.species).toEqual(['Choose a subrace for Dwarf.']);
    expect(steps.skills).toEqual([]);
    expect(issuesByStep(cleric({ skills: [] })).skills).toEqual(['Choose 2 class skills.']);
    expect(issuesByStep(cleric()).spells).toEqual([]);
  });
});

describe('levelUp', () => {
  it('adds a level with its hit points, improvement and new spells', () => {
    const c = levelUp(cleric({ level: 3, hpRolls: [5, 5] }), {
      hp: 6,
      improvement: { wis: 2 },
      spells: [...cleric().spells, 'thaumaturgy', 'shield-of-faith', 'sanctuary', 'aid', 'lesser-restoration'],
    });
    expect(c).toMatchObject({ level: 4, hpRolls: [5, 5, 6], improvements: [{ wis: 2 }] });
    expect(characterIssues(c)).toEqual([]);
  });

  it('asks for the subclass once the level reaches it', () => {
    expect(characterIssues(cleric({ subclass: undefined }))).toEqual(['Choose a Cleric subclass.']);
  });

  it('takes the subclass at its level', () => {
    expect(levelUp(wizard({ level: 2, hpRolls: [4] }), { hp: 4, subclass: 'evoker' }).subclass).toBe('evoker');
  });
});

describe('characterToken', () => {
  it('turns a character into a token the rules can use', () => {
    const token = characterToken(cleric());
    expect(token).toMatchObject({
      name: 'Tordek',
      speed: 25,
      darkvision: 60,
      ownership: { default: 'limited', kaniel: 'owner' },
      stats: {
        rules: '2014',
        class: 'cleric',
        level: 1,
        maxHp: 12,
        abilities: { con: 17, wis: 16 },
        skills: ['insight', 'religion', 'medicine', 'history'],
        spells: cleric().spells,
      },
    });
    expect(token.inventory?.length).toBeGreaterThan(2);
  });
});

describe('newCharacter', () => {
  it('starts a blank 2014 character with the standard array', () => {
    const c = newCharacter({ id: 'x', owner: 'kaniel', rules: '2014' });
    expect(c).toMatchObject({ level: 1, method: 'standard', species: 'human', class: 'fighter' });
  });
});
