import { describe, expect, it } from 'vitest';
import { resolveCreature } from './creature.ts';
import { gameCompendia, homebrewCompendia, homebrewIssues } from './homebrew.ts';
import { contentWith } from './packs.ts';
import { TokenSchema } from './token-schema.ts';

// A game's own classes (and later monsters, items, spells): documents of the
// homebrew collection, read like a pack's compendia.

const illusionist = {
  id: 'illusionist',
  kind: 'class',
  name: 'Illusionist',
  hitDie: 8,
  saves: ['int', 'wis'],
  scales: [
    {
      id: 'lucidity',
      name: 'Lucidity',
      values: [
        [1, 4],
        [5, 10],
      ],
    },
  ],
  choices: [
    {
      id: 'discovery',
      name: 'Discoveries',
      count: [
        [2, 1],
        [5, 2],
      ],
    },
  ],
  subclassLevel: 3,
  subclasses: [
    {
      id: 'dreamer',
      name: 'Dreamer',
      features: [{ id: 'waking-dream', name: 'Waking Dream', level: 3 }],
    },
  ],
  features: [
    { id: 'weave', name: 'Weave', level: 1, description: 'You weave an illusion.' },
    { id: 'half-real', name: 'Half-Real', level: 10 },
    { id: 'far-weaving', name: 'Far Weaving', level: 2, choice: 'discovery' },
    { id: 'echo', name: 'Echo', level: 2, choice: 'discovery' },
  ],
};

const content = contentWith('2014', homebrewCompendia([illusionist]));
const own = (ids: string[]) => ids.filter((id) => !['dash', 'dodge', 'disengage', 'hide', 'help'].includes(id));
const hero = (stats: object) => TokenSchema.parse({ id: 'h', name: 'Hero', x: 0, y: 0, stats });

describe('homebrew classes', () => {
  it('join the game’s content like a pack’s', () => {
    expect(content.classes.get('illusionist')?.name).toBe('Illusionist');
    expect(content.classes.get('wizard')?.name).toBe('Wizard');
    expect(homebrewCompendia([illusionist, { id: 'x', kind: 'trap', name: 'X' }])).toHaveLength(1);
  });

  it('give hit points, saves and features by level', () => {
    const sheet = resolveCreature(
      hero({ class: 'illusionist', level: 3, abilities: { con: 10, int: 10, wis: 14 } }),
      content,
    )!;
    expect(sheet.maxHp).toBe(8 + 2 * 5);
    expect(sheet.saves.wis).toBe(4);
    expect(own(sheet.features.map((f) => f.id))).toEqual(['weave']);
  });

  it('add the subclass’s features and the options picked', () => {
    const sheet = resolveCreature(
      hero({ classes: [{ class: 'illusionist', level: 3, subclass: 'dreamer' }], features: ['illusionist/echo'] }),
      content,
    )!;
    expect(own(sheet.features.map((f) => f.id))).toEqual(['weave', 'waking-dream', 'echo']);
  });

  it('show their scale values at the class level', () => {
    const at = (level: number) => resolveCreature(hero({ class: 'illusionist', level }), content)!.scales;
    expect(at(4)).toEqual([{ id: 'lucidity', name: 'Lucidity', value: 4 }]);
    expect(at(6)).toEqual([{ id: 'lucidity', name: 'Lucidity', value: 10 }]);
  });

  it('say what is wrong with a document', () => {
    expect(homebrewIssues(illusionist)).toEqual([]);
    expect(homebrewIssues({ ...illusionist, hitDie: 'd8' })).toEqual([expect.stringMatching(/hitDie/)]);
    expect(homebrewIssues({ id: 'x', kind: 'trap', name: 'X' })).toEqual([expect.stringMatching(/kind/)]);
  });
});

describe("a game's compendia", () => {
  const pack = { id: 'p-items', name: 'Items', type: 'item', path: 'items.json', pack: 'p', docs: [] };
  const packs = [pack];

  it('adds the homebrew documents to the packs and keeps the list while nothing changes', () => {
    const game = {};
    const first = gameCompendia(game, packs, [{ ...illusionist, rev: 1 }]);
    expect(first.map((c) => c.id)).toEqual(['p-items', 'homebrew-class']);
    expect(gameCompendia(game, packs, [{ ...illusionist, rev: 1 }])).toBe(first);
    expect(gameCompendia(game, packs, [{ ...illusionist, rev: 2 }])).not.toBe(first);
  });

  it('reads stored documents through `read`, and gives just the packs without homebrew', () => {
    const read = (d: { id: string }) => ({ ...d, kind: 'class' });
    expect(gameCompendia({}, packs, [{ ...illusionist, kind: undefined }], read)[1]?.docs).toHaveLength(1);
    expect(gameCompendia({}, packs, [])).toEqual(packs);
  });
});
