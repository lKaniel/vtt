import { describe, expect, it } from 'vitest';
import { drawFrom, drawnPatch, resetPatch } from './roll-tables.ts';
import { nextTrack, playPatch, stopPatch } from './playlists.ts';
import { JournalSchema, type Playlist, type RollTable } from './journals.ts';

const table: RollTable = {
  id: 'loot',
  name: 'Loot',
  results: [{ text: 'Copper' }, { text: 'Silver', weight: 2 }, { text: 'Gold' }],
};

describe('roll tables', () => {
  it('draw by weight: the dice run over every chance', () => {
    // 4 chances: Copper 1, Silver 2-3, Gold 4.
    expect(drawFrom(table, () => 0)).toEqual({ index: 0, roll: 1, of: 4 });
    expect(drawFrom(table, () => 0.3)).toEqual({ index: 1, roll: 2, of: 4 });
    expect(drawFrom(table, () => 0.7)).toEqual({ index: 1, roll: 3, of: 4 });
    expect(drawFrom(table, () => 0.99)).toEqual({ index: 2, roll: 4, of: 4 });
  });

  it('skip what was drawn when they draw without replacement, until reset', () => {
    const once: RollTable = { ...table, replacement: false };
    expect(drawnPatch(once, 1)).toEqual({
      results: [{ text: 'Copper' }, { text: 'Silver', weight: 2, drawn: true }, { text: 'Gold' }],
    });
    const after = { ...once, ...drawnPatch(once, 1) };
    expect(drawFrom(after, () => 0.99)).toEqual({ index: 2, roll: 2, of: 2 });
    expect(drawFrom({ ...after, results: after.results.map((r) => ({ ...r, drawn: true })) }, () => 0)).toBeUndefined();
    expect(resetPatch(after)).toEqual({ results: table.results });
    // With replacement, nothing is marked.
    expect(drawnPatch(table, 1)).toBeUndefined();
  });
});

const list = (mode: Playlist['mode']): Playlist => ({
  id: 'tavern',
  name: 'Tavern',
  mode,
  tracks: [
    { id: 'a', name: 'A', src: 'a.ogg' },
    { id: 'b', name: 'B', src: 'b.ogg' },
    { id: 'c', name: 'C', src: 'c.ogg' },
  ],
});

describe('playlists', () => {
  it('play one track at a time in a sequence, or all together', () => {
    const playing = (p: Partial<Playlist>) => (p.tracks ?? []).filter((t) => t.playing).map((t) => t.id);
    expect(playing(playPatch(list('sequence')))).toEqual(['a']);
    expect(playing(playPatch(list('sequence'), 'b'))).toEqual(['b']);
    expect(playing(playPatch(list('together')))).toEqual(['a', 'b', 'c']);
    expect(playing(stopPatch({ ...list('together'), ...playPatch(list('together')) }))).toEqual([]);
  });

  it('go on to the next track when one ends, round to the first', () => {
    expect(nextTrack(list('sequence'), 'a', () => 0)).toBe('b');
    expect(nextTrack(list('sequence'), 'c', () => 0)).toBe('a');
    // Shuffle picks another track at random.
    expect(nextTrack(list('shuffle'), 'a', () => 0)).toBe('b');
    expect(nextTrack(list('shuffle'), 'a', () => 0.99)).toBe('c');
    // Together, tracks repeat on their own.
    expect(nextTrack(list('together'), 'a', () => 0)).toBeUndefined();
  });
});

describe('journal entries', () => {
  it('have text pages by default', () => {
    const entry = JournalSchema.parse({
      id: 'inn',
      name: 'The inn',
      pages: [{ id: 'p1', name: 'Rooms', text: 'Three.' }],
    });
    expect(entry.pages[0]!.kind).toBe('text');
  });
});
