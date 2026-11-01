import { describe, expect, it } from 'vitest';
import { convertOrigins, type OriginEntry } from './origins-convert.ts';
import type { Pack } from './srd-convert.ts';

function pack(entries: OriginEntry[], text: Record<string, string> = {}): Pack {
  return { entries: new Map(entries.map((e) => [e.id, e])), text };
}

const known = [{ id: 'longsword', name: 'Longsword' }];

const add = (item: string, extra: object = {}) => ({ type: 'addItem', entry: { item: `'${item}'`, ...extra } });

describe('convertOrigins: species', () => {
  const dwarf: OriginEntry = {
    id: 'races.dwarf',
    type: 'race',
    fields: { speed: 25, size: 'medium' },
    effects: [{ target: 'abilities.con.base', op: 'add', value: 2 }],
    grants: [{ item: 'traits.darkvision' }, { item: 'traits.stonecunning' }, { item: 'languages.common' }],
  };
  const hill: OriginEntry = {
    id: 'subraces.hill-dwarf',
    type: 'subrace',
    fields: { race: 'races.dwarf' },
    effects: [{ target: 'abilities.wis.base', op: 'add', value: 1 }],
    grants: [{ item: 'traits.dwarven-toughness' }],
  };
  const traits: OriginEntry[] = [
    { id: 'traits.darkvision', type: 'trait', effects: [{ target: 'senses.darkvision', op: 'atLeast', value: 60 }] },
    { id: 'traits.stonecunning', type: 'trait' },
    { id: 'traits.dwarven-toughness', type: 'trait' },
  ];
  const text = {
    'races.dwarf.name': 'Dwarf',
    'races.dwarf.description': 'Stout.',
    'subraces.hill-dwarf.name': 'Hill dwarf',
    'traits.darkvision.name': 'Darkvision',
    'traits.darkvision.description': 'See in the dark.',
    'traits.stonecunning.name': 'Stonecunning',
    'traits.dwarven-toughness.name': 'Dwarven Toughness',
  };

  it('reads speed, size, darkvision, bonuses, traits and subraces', () => {
    const out = convertOrigins(pack([dwarf, hill, ...traits], text), known);
    expect(out.species).toEqual([
      {
        id: 'dwarf',
        name: 'Dwarf',
        description: 'Stout.',
        sizes: ['medium'],
        speed: 25,
        darkvision: 60,
        bonuses: { con: 2 },
        traits: [
          { name: 'Darkvision', description: 'See in the dark.' },
          { name: 'Stonecunning', description: '' },
        ],
        subspecies: [
          {
            id: 'hill-dwarf',
            name: 'Hill dwarf',
            description: '',
            bonuses: { wis: 1 },
            traits: [{ name: 'Dwarven Toughness', description: '' }],
          },
        ],
      },
    ]);
  });

  it('reads a choice of ability bonuses and a choice of size', () => {
    const halfElf: OriginEntry = {
      id: 'races.half-elf',
      type: 'race',
      fields: { speed: 30, size: 'choice' },
      effects: [{ target: 'abilities.cha.base', op: 'add', value: 2 }],
      choices: [
        {
          id: 'ability-scores',
          pick: 2,
          from: {
            options: ['str', 'dex', 'cha'].map((a) => ({
              id: a,
              effects: [{ target: `abilities.${a}.base`, op: 'add', value: 1 }],
            })),
          },
        },
      ],
    };
    const [species] = convertOrigins(pack([halfElf]), known).species;
    expect(species).toMatchObject({
      sizes: ['small', 'medium'],
      bonusChoice: { count: 2, amount: 1, from: ['str', 'dex'] },
    });
  });

  it('takes 2024 lineages as subspecies', () => {
    const elf: OriginEntry = { id: 'species.elf', type: 'species', fields: { speed: 30, size: 'medium' } };
    const drow: OriginEntry = {
      id: 'lineages.drow',
      type: 'lineage',
      fields: { species: 'species.elf' },
      effects: [{ target: 'senses.darkvision', op: 'atLeast', value: 120 }],
    };
    const [species] = convertOrigins(pack([elf, drow], { 'lineages.drow.name': 'Drow' }), known).species;
    expect((species as { subspecies: unknown }).subspecies).toEqual([
      { id: 'drow', name: 'Drow', description: '', bonuses: {}, traits: [], darkvision: 120 },
    ]);
  });
});

describe('convertOrigins: backgrounds', () => {
  it('reads skills, the 2024 ability choice, the feat and the kit', () => {
    const soldier: OriginEntry = {
      id: 'backgrounds.soldier',
      type: 'background',
      effects: [
        { target: 'proficiencies.skills', op: 'grant', value: { tag: 'skill.athletics' } },
        { target: 'proficiencies.skills', op: 'grant', value: { tag: 'skill.intimidation' } },
      ],
      grants: [{ item: 'feats.savage-attacker' }],
      choices: [
        {
          id: 'ability-increase',
          from: {
            options: [{ id: 'two-and-one', choices: [{ id: 'plus-two', from: { values: ['str', 'dex', 'con'] } }] }],
          },
        },
      ],
      actions: [
        {
          id: 'kit',
          steps: [
            {
              id: 'soldier',
              kind: 'choice',
              options: [
                {
                  id: 'a',
                  changes: [add('weapons.longsword', { equipped: true }), add('gear.arrows', { quantity: 20 })],
                },
                { id: 'b', changes: [{ type: 'adjust', field: 'coins.gp', by: 50 }] },
              ],
            },
          ],
        },
      ],
    };
    const arrows: OriginEntry = { id: 'gear.arrows', type: 'gear', fields: { weight: 0.05 } };
    const text = {
      'backgrounds.soldier.name': 'Soldier',
      'feats.savage-attacker.name': 'Savage Attacker',
      'gear.arrows.name': 'Arrows',
    };
    const out = convertOrigins(pack([soldier, arrows], text), known);
    expect(out.backgrounds).toEqual([
      {
        id: 'soldier',
        name: 'Soldier',
        description: '',
        skills: ['athletics', 'intimidation'],
        abilities: ['str', 'dex', 'con'],
        feat: { name: 'Savage Attacker', description: '' },
        kit: [
          {
            id: 'soldier',
            prompt: '',
            options: [
              {
                id: 'a',
                label: 'Longsword, Arrows ×20',
                items: [
                  { item: 'longsword', qty: 1, equipped: true },
                  { item: 'arrows', qty: 20, equipped: false },
                ],
              },
              { id: 'b', label: '50 gp', items: [{ item: 'gp', qty: 50, equipped: false }] },
            ],
          },
        ],
      },
    ]);
    expect(out.gear).toEqual([
      { type: 'gear', id: 'arrows', name: 'Arrows', weight: 0.05 },
      { type: 'gear', id: 'gp', name: 'Gold piece', weight: 0.02 },
    ]);
  });
});

describe('convertOrigins: classes', () => {
  const fighter: OriginEntry = {
    id: 'classes.fighter',
    type: 'class',
    choices: [
      { id: 'skills', pick: 2, from: { values: ['skill.athletics', 'skill.history'] } },
      { id: 'archetype', from: { type: 'subclass' }, when: 'self.level >= 3' },
    ],
    actions: [
      {
        id: 'kit',
        steps: [
          {
            id: 'fighterWeapons',
            kind: 'choice',
            options: [{ id: 'martial-and-shield' }, { id: 'two-martial' }],
          },
          {
            id: 'fighterMartial2',
            kind: 'choice',
            when: "steps.fighterWeapons.picked == 'two-martial'",
            options: { content: { type: 'weapon', where: "item.category == 'martial'" } },
            changes: [{ type: 'addItem', entry: { item: 'picked.id', equipped: true } }],
          },
        ],
      },
    ],
  };
  const champion: OriginEntry = { id: 'subclasses.champion', type: 'subclass', fields: { class: 'classes.fighter' } };
  const longsword: OriginEntry = { id: 'weapons.longsword', type: 'weapon', fields: { category: 'martial' } };
  const club: OriginEntry = { id: 'weapons.club', type: 'weapon', fields: { category: 'simple' } };
  const text = {
    'subclasses.champion.name': 'Champion',
    'classes.fighter.actions.kit.options.two-martial.name': 'Two martial weapons',
    'classes.fighter.actions.kit.steps.fighterMartial2.prompt': 'Choose a second martial weapon',
    'weapons.longsword.name': 'Longsword',
  };

  it('reads skill choices, the subclass level, subclasses and kit steps', () => {
    const out = convertOrigins(pack([fighter, champion, longsword, club], text), known);
    expect(out.classes).toEqual([
      {
        id: 'fighter',
        skills: { pick: 2, from: ['athletics', 'history'] },
        subclassLevel: 3,
        subclasses: [{ id: 'champion', name: 'Champion', description: '' }],
        kit: [
          {
            id: 'fighterWeapons',
            prompt: '',
            options: [
              { id: 'martial-and-shield', label: 'martial-and-shield', items: [] },
              { id: 'two-martial', label: 'Two martial weapons', items: [] },
            ],
          },
          {
            id: 'fighterMartial2',
            prompt: 'Choose a second martial weapon',
            when: { step: 'fighterWeapons', option: 'two-martial' },
            options: [{ id: 'longsword', label: 'Longsword', items: [{ item: 'longsword', qty: 1, equipped: true }] }],
          },
        ],
      },
    ]);
  });
});
