import { JournalSchema } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { foundryEntries } from './foundry-entries.ts';

// Simple Quest (the Foundry module behind the J book): its quest, map,
// lore and party pages as entries the adventure book shelves.

const media = (path: string) => `/assets/${path}`;

const folders = [
  { _id: 'Root', name: 'Simple Quest', type: 'JournalEntry', flags: { 'simple-quest': { simpleQuestDir: 'root' } } },
  {
    _id: 'Party',
    name: 'Party',
    type: 'JournalEntry',
    folder: 'Root',
    flags: { 'simple-quest': { simpleQuestDir: 'party' } },
  },
  { _id: 'Maks', name: 'MAKSIM', type: 'JournalEntry', folder: 'Party' },
  { _id: 'Lore', name: 'Lore', type: 'JournalEntry', folder: 'Root' },
];

const questText =
  '<p>Find the girl.</p><ul><li><p>Ask the innkeeper</p></li><li><p>Search the woods</p></li><li><p>Bring her home</p></li></ul>';

const out = foundryEntries(
  {
    folders,
    journals: [
      {
        _id: 'InProg',
        name: 'In Progress',
        folder: 'Root',
        pages: [
          {
            _id: 'Q1',
            name: 'The Lost Girl',
            type: 'simple-quest.quest',
            text: { content: questText },
            system: {
              status: 0,
              src: 'quests/girl.webp',
              objectiveState: { 'ask-the-innkeeper': 1, 'search-the-woods': 2 },
            },
          },
          { _id: 'Q2', name: 'Old Debts', type: 'simple-quest.quest', text: { content: '' }, system: { status: 1 } },
        ],
      },
      {
        _id: 'Maps',
        name: 'Maps',
        folder: 'Root',
        pages: [
          {
            _id: 'M1',
            name: 'Main map',
            type: 'simple-quest.map',
            system: { src: 'maps/forest.webp', subtitle: 'The forest' },
          },
        ],
      },
      {
        _id: 'Arc',
        name: 'Forest arc',
        folder: 'Maks',
        pages: [{ _id: 'T1', name: 'Day 1', type: 'text', text: { content: '<p>A wolf.</p>' } }],
      },
      {
        _id: 'Npc',
        name: 'NPCs',
        folder: 'Lore',
        pages: [
          {
            _id: 'C1',
            name: 'The Lich',
            type: 'simple-quest.character',
            text: { content: '<p>Old and grey.</p>' },
            system: {
              src: 'npc/lich.webp',
              mainTag: { value: 'Otherworldly' },
              table: { label: 'Equipment', list: [{ name: 'Neck', value: 'Phylactery' }] },
            },
          },
        ],
      },
    ],
  },
  media,
);

const entry = (name: string) => out.journals.find((j) => j.name === name)!;

describe('Simple Quest pages', () => {
  it('make each quest page a quest of its own, objectives ticked as they were', () => {
    const girl = entry('The Lost Girl');
    expect(girl.quest).toEqual({
      status: 'active',
      objectives: [{ text: 'Ask the innkeeper', done: true }, { text: 'Search the woods' }, { text: 'Bring her home' }],
    });
    expect(girl.pages.map((p) => p.kind)).toEqual(['image', 'text']);
    expect(entry('Old Debts').quest?.status).toBe('done');
    expect(out.journals.some((j) => j.name === 'In Progress')).toBe(false);
  });

  it('shelve map pages as maps, with their picture', () => {
    const maps = entry('Maps');
    expect(maps.book).toBe('map');
    expect(maps.pages[0]).toMatchObject({ kind: 'image', src: '/assets/maps/forest.webp', name: 'Main map' });
  });

  it('put what was in the party folders into the party log', () => {
    expect(entry('Forest arc').book).toBe('log');
    expect(entry('NPCs').book).toBeUndefined();
  });

  it('keep a lore page’s picture, text and facts', () => {
    const [img, text] = entry('NPCs').pages;
    expect(img).toMatchObject({ kind: 'image', src: '/assets/npc/lich.webp' });
    expect(text?.text).toContain('Old and grey.');
    expect(text?.text).toContain('Otherworldly');
    expect(text?.text).toContain('<strong>Neck</strong>: Phylactery');
  });

  it('make entries the game accepts, and lose nothing', () => {
    for (const j of out.journals) expect(JournalSchema.safeParse(j).success).toBe(true);
    expect(out.skipped).toEqual([]);
  });
});
