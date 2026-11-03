import { describe, expect, it } from 'vitest';
import { leftOutLine, LossLog, lost, placed } from './import-losses.ts';

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
