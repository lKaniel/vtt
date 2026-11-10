import { describe, expect, it } from 'vitest';
import { leftOutLine, LossLog, lost, placed, reportLines } from './import-losses.ts';

describe('LossLog', () => {
  it('groups one kind of loss over the whole world, the most first', () => {
    const log = new LossLog();
    log.add(
      placed('Crypt', [lost('Walls that stop nothing', 2), lost('Tokens whose actor is gone', 3, ['tree', 'torch'])]),
    );
    log.add(placed('Inn', [lost('Tokens whose actor is gone', 1, ['tree', 'lamp'])]));
    log.add(placed('Crypt', [lost('Tokens whose actor is gone', 1)]));
    expect(log.list()).toEqual([
      {
        what: 'Tokens whose actor is gone',
        count: 5,
        examples: ['tree', 'torch', 'lamp'],
        places: ['Crypt', 'Inn'],
        placeCount: 2,
      },
      { what: 'Walls that stop nothing', count: 2, examples: [], places: ['Crypt'], placeCount: 1 },
    ]);
  });

  it('keeps a few names and places of a big group, and counts them all', () => {
    const log = new LossLog();
    for (let i = 0; i < 30; i++)
      log.add(placed(`Scene ${i}`, [lost('Tiles whose picture could not be found', 1, [`p${i}.webp`])]));
    const [tiles] = log.list();
    expect(tiles).toMatchObject({ count: 30, placeCount: 30 });
    expect(tiles!.examples).toHaveLength(8);
    expect(tiles!.places).toHaveLength(10);
    expect(leftOutLine(tiles!)).toMatch(
      /^30 Tiles whose picture could not be found \(in 30: Scene 0, .*, \.\.\.\): p0\.webp, .*, \.\.\.$/,
    );
  });
});

describe('reportLines', () => {
  const report = {
    name: 'Cursed Lands',
    scenes: 2,
    actors: 3,
    tokens: 4,
    journals: 1,
    tables: 0,
    playlists: 1,
    media: 9,
    left: [{ what: 'Cards', count: 2, examples: [], places: [], placeCount: 0 }],
  };

  it('says what a new game got and what stayed behind', () => {
    expect(reportLines('cursed-lands', report)).toEqual([
      'Made "Cursed Lands" (data/games/cursed-lands): 2 scenes, 3 actors, 4 tokens, 1 journal entries, 0 tables, 1 playlists, 9 files.',
      '  left out: 2 Cards',
    ]);
  });

  it('says what a re-import kept of the game', () => {
    const lines = reportLines('cursed-lands', {
      ...report,
      left: [],
      kept: { files: 12, scenes: ['Grotto', 'Glade'] },
    });
    expect(lines).toEqual([
      expect.stringMatching(/^Imported again "Cursed Lands"/),
      '  kept from the VTT: 12 files, scenes: Grotto, Glade',
    ]);
  });
});
