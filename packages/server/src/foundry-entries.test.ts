import { JournalSchema, PlaylistSchema, RollTableSchema } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { foundryEntries } from './foundry-entries.ts';

// Journal entries, roll tables and playlists of a Foundry module, as ours.

const media = (path: string) => (path === 'music/inn.ogg' ? 'pack://m/media/music/inn.ogg' : undefined);

describe('Foundry sidebar documents', () => {
  const out = foundryEntries(
    {
      journals: [
        {
          _id: 'Jx1',
          name: 'The Old Well',
          pages: [
            { _id: 'Pg1', name: 'History', type: 'text', text: { content: '<p>Dug long ago.</p>' } },
            { _id: 'Pg2', name: 'Map', type: 'image', src: 'music/inn.ogg' },
            { _id: 'Pg3', name: 'Video', type: 'video' },
          ],
        },
        { _id: 'Jx2', name: 'Old style', content: '<p>v9 text</p>' },
      ],
      tables: [
        {
          name: 'Loot',
          description: 'What the goblin has',
          replacement: false,
          results: [
            { text: 'Gold', weight: 2, range: [1, 2] },
            { text: 'A rat', range: [3, 3], drawn: true },
          ],
        },
      ],
      playlists: [
        {
          name: 'Inn',
          mode: 1,
          sounds: [
            { name: 'Lute', path: 'music/inn.ogg', volume: 0.5, repeat: true },
            { name: 'Gone', path: 'music/gone.ogg' },
          ],
        },
      ],
    },
    media,
  );

  it('bring journal entries with their text and picture pages, and say which ids they got', () => {
    expect(out.journals).toEqual([
      {
        id: 'the-old-well',
        name: 'The Old Well',
        pages: [
          { id: 'history', name: 'History', kind: 'text', text: '<p>Dug long ago.</p>' },
          { id: 'map', name: 'Map', kind: 'image', src: 'pack://m/media/music/inn.ogg' },
        ],
      },
      {
        id: 'old-style',
        name: 'Old style',
        pages: [{ id: 'text', name: 'Text', kind: 'text', text: '<p>v9 text</p>' }],
      },
    ]);
    for (const j of out.journals) JournalSchema.parse(j);
    expect(out.entries('Jx1')).toBe('the-old-well');
    expect(out.pages('Pg1')).toBe('history');
    expect(out.skipped).toContain('journal "The Old Well": 1 page of a kind we have no match for (video)');
  });

  it('bring roll tables with their weights', () => {
    expect(out.tables).toEqual([
      {
        id: 'loot',
        name: 'Loot',
        description: 'What the goblin has',
        replacement: false,
        results: [
          { text: 'Gold', weight: 2 },
          { text: 'A rat', weight: 1, drawn: true },
        ],
      },
    ]);
    for (const t of out.tables) RollTableSchema.parse(t);
  });

  it('bring playlists with the tracks whose file came along', () => {
    expect(out.playlists).toEqual([
      {
        id: 'inn',
        name: 'Inn',
        mode: 'shuffle',
        tracks: [{ id: 'lute', name: 'Lute', src: 'pack://m/media/music/inn.ogg', volume: 0.5, repeat: true }],
      },
    ]);
    for (const p of out.playlists) PlaylistSchema.parse(p);
    expect(out.skipped).toContain('playlist "Inn": 1 track whose file is not in the module (music/gone.ogg)');
  });
});
