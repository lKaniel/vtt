import type { Chunk, SceneLevel } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { tilesOnFloor } from './floor-tiles.ts';

// A tavern in the Levels style: a cellar, the ground floor and the floor
// upstairs, each a picture on its own level, and the roof over them all.

type Tile = Chunk['tiles'][number];

const LEVELS: SceneLevel[] = [
  { id: 'cellar', name: 'Cellar', bottom: -10, top: -1 },
  { id: 'ground', name: 'Ground', bottom: 0, top: 9, sees: ['cellar'] },
  { id: 'upstairs', name: 'Upstairs', bottom: 10, top: 19, sees: ['cellar', 'ground'] },
];

const pic = (id: string, extra: Partial<Extract<Tile, { kind: 'image' }>> = {}): Tile => ({
  id,
  kind: 'image',
  src: `${id}.webp`,
  x: 0,
  y: 0,
  w: 1000,
  h: 800,
  ...extra,
});

const TILES: Tile[] = [
  pic('street'),
  pic('cellar-floor', { level: 'cellar' }),
  pic('ground-floor', { level: 'ground' }),
  pic('trapdoor', { level: 'ground', overhead: true }),
  pic('upstairs-floor', { level: 'upstairs', overhead: true }),
  pic('flag', { level: 'upstairs', w: 100, h: 100 }),
  pic('roof', { overhead: true }),
  pic('canopy', { levels: ['ground', 'upstairs'], overhead: true }),
];

const view = (tiles: Tile[]) =>
  Object.fromEntries(tiles.map((t) => [t.id, t.kind === 'image' && t.overhead ? 'roof' : 'floor']));

describe('the tiles drawn for a floor', () => {
  it('draw every tile as it is when no floor is picked', () => {
    expect(tilesOnFloor(TILES, LEVELS, undefined, undefined)).toEqual(TILES);
  });

  it('on the ground floor: the floors above stand over it as roofs, the cellar is out of sight', () => {
    const tiles = tilesOnFloor(TILES, LEVELS, ['cellar', 'ground'], 'ground');
    expect(view(tiles)).toEqual({
      street: 'floor',
      'cellar-floor': 'floor',
      'ground-floor': 'floor',
      trapdoor: 'floor',
      'upstairs-floor': 'roof',
      flag: 'roof',
      roof: 'roof',
      canopy: 'roof',
    });
  });

  it('upstairs: its own floor is under your feet, not a roof over your head', () => {
    const tiles = tilesOnFloor(TILES, LEVELS, ['cellar', 'ground', 'upstairs'], 'upstairs');
    expect(view(tiles)).toMatchObject({ 'upstairs-floor': 'floor', flag: 'floor', roof: 'roof', canopy: 'floor' });
  });

  it('stack higher floors over lower ones, and the roof over every floor', () => {
    const tiles = tilesOnFloor(TILES, LEVELS, ['cellar', 'ground'], 'ground');
    const z = (id: string) => tiles.find((t) => t.id === id)!.z!;
    expect(z('cellar-floor')).toBeLessThan(z('ground-floor'));
    expect(z('ground-floor')).toBeLessThan(z('upstairs-floor'));
    expect(z('upstairs-floor')).toBeLessThan(z('flag'));
    expect(z('flag')).toBeLessThan(z('roof'));
  });

  it('leave out what is below and not seen from there', () => {
    const levels = LEVELS.map((l) => (l.id === 'ground' ? { ...l, sees: [] } : l));
    const ids = tilesOnFloor(TILES, levels, ['ground'], 'ground').map((t) => t.id);
    expect(ids).not.toContain('cellar-floor');
    expect(ids).toContain('upstairs-floor');
  });
});
