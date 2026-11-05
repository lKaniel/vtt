import { describe, expect, it } from 'vitest';
import { convertClass, countTable } from './class-convert.ts';
import type { Pack } from './srd-convert.ts';
import type { ClassEntry as Entry } from './class-convert.ts';

function pack(entries: Entry[], text: Record<string, string> = {}): Pack {
  return { entries: new Map(entries.map((e) => [e.id, e])), text };
}

const fighter: Entry = {
  id: 'classes.fighter',
  type: 'class',
  fields: { hitDie: '1d10' },
  effects: [{ target: 'proficiencies.saves', op: 'grant', value: { tag: 'save.str' } }],
  grants: [
    { item: 'features.fighter.action-surge', when: 'self.level >= 2' },
    { item: 'features.fighter.second-wind', when: 'self.level >= 1' },
    { item: 'features.ability-score-improvement', when: 'self.level >= 4' },
  ],
  choices: [
    { id: 'fighting-style', from: { type: 'fightingStyle' }, when: 'self.level >= 1' },
    { id: 'martial-archetype', from: { type: 'subclass' }, when: 'self.level >= 3' },
    { id: 'skills', from: { values: ['skill.athletics'] }, pick: 2 },
  ],
};

const styles: Entry[] = [
  { id: 'fighting-styles.archery', type: 'fightingStyle' },
  { id: 'fighting-styles.defense', type: 'fightingStyle' },
];

const champion: Entry = {
  id: 'subclasses.champion',
  type: 'subclass',
  fields: { class: 'classes.fighter' },
  grants: [
    { item: 'features.improved-critical', when: 'self.level >= 3' },
    { item: 'spells.bless', when: 'self.level >= 3' },
  ],
};

describe('convertClass', () => {
  const p = pack([fighter, champion, ...styles], {
    'features.fighter.second-wind.name': 'Second Wind',
    'fighting-styles.archery.name': 'Archery',
    'fighting-styles.archery.description': '+2 to ranged attacks.',
    'subclasses.champion.name': 'Champion',
    'features.improved-critical.name': 'Improved Critical',
  });
  const out = convertClass(p, fighter) as Record<string, unknown>;

  it('takes hit die, saves and features by level', () => {
    expect(out).toMatchObject({
      id: 'fighter',
      hitDie: 10,
      saves: ['str'],
      subclassLevel: 3,
    });
    expect((out.features as { id: string }[]).filter((f) => !('choice' in f))).toMatchObject([
      { id: 'second-wind', name: 'Second Wind', level: 1 },
      { id: 'action-surge', level: 2 },
    ]);
  });

  it('turns picks among options into a choice with its options as features', () => {
    expect(out.choices).toEqual([{ id: 'fighting-style', name: 'Fighting Style', count: [[1, 1]] }]);
    expect(out.features).toContainEqual({
      id: 'archery',
      name: 'Archery',
      level: 1,
      choice: 'fighting-style',
      description: '+2 to ranged attacks.',
    });
  });

  it('brings the subclasses with their features and the spells they always have', () => {
    expect(out.subclasses).toEqual([
      {
        id: 'champion',
        name: 'Champion',
        description: '',
        features: [
          { id: 'improved-critical', name: 'Improved Critical', level: 3, description: '' },
          {
            id: 'champion-spells',
            name: 'Champion Spells',
            level: 3,
            description: 'Spells you always have prepared.',
            grantsSpells: [[3, 'bless']],
          },
        ],
      },
    ]);
  });
});

describe('class options', () => {
  it('a picked option that is a pick of fighting style feats offers those feats (2024 paladin)', () => {
    const paladin: Entry = {
      id: 'classes.paladin',
      type: 'class',
      grants: [{ item: 'features.paladin.fighting-style', when: 'self.level >= 2' }],
    };
    const style: Entry = {
      id: 'features.paladin.fighting-style',
      type: 'feature',
      choices: [
        {
          id: 'style',
          from: {
            options: [
              {
                id: 'feat',
                choices: [{ id: 'feat', from: { type: 'feat', where: "item.category == 'fighting-style'" } }],
              },
              { id: 'blessed-warrior' },
            ],
          },
        },
      ],
    };
    const archery: Entry = { id: 'feats.archery', type: 'feat', fields: { category: 'fighting-style' } };
    const out = convertClass(pack([paladin, style, archery]), paladin) as {
      features: { id: string; choice?: string }[];
    };
    expect(out.features.filter((f) => f.choice).map((f) => f.id)).toEqual(['archery', 'blessed-warrior']);
  });
});

describe('countTable', () => {
  it('reads level ternaries, per-level lists and slot levels', () => {
    expect(countTable('self.level >= 17 ? 4 : self.level >= 10 ? 3 : 2', 2)).toEqual([
      [2, 2],
      [10, 3],
      [17, 4],
    ]);
    expect(countTable('[2, 2, 3, 3, 4][self.level - 1]', 1)).toEqual([
      [1, 2],
      [3, 3],
      [5, 4],
    ]);
    expect(countTable(undefined, 3)).toEqual([[3, 1]]);
    expect(countTable(2, 1)).toEqual([[1, 2]]);
  });
});
