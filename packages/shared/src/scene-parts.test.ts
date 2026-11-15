import { describe, expect, it } from 'vitest';
import type { Chunk, Wall } from './schema.ts';
import { canBePart, docIntoWhole, homeOf, intoPart, intoWhole, laidDocs, partErrors, partId } from './scene-parts.ts';

const part = { scene: 'market', x: 3000, y: -1500 };

describe('scene parts', () => {
  it('places a tile of a part on the whole scene, under an id of its own', () => {
    const tile = { kind: 'image', id: 'inn', x: 100, y: 200, w: 300, h: 300, src: '/a.webp', parent: 'block' };
    const placed = intoWhole('tiles', tile as Chunk['tiles'][number], part);
    expect(placed).toMatchObject({ id: 'market--inn', part: 'market', x: 3100, y: -1300, parent: 'market--block' });
    expect(intoPart('tiles', placed, part)).toEqual(tile);
  });

  it('moves a wall by both ends and keeps the tile it is fastened to', () => {
    const wall = { id: 'w1', a: [0, 0], b: [150, 0], door: 'closed', tile: 'inn' } as Wall;
    const placed = intoWhole('walls', wall, part);
    expect(placed).toMatchObject({ id: 'market--w1', a: [3000, -1500], b: [3150, -1500], tile: 'market--inn' });
    expect(intoPart('walls', { ...placed, door: 'open' }, part)).toEqual({ ...wall, door: 'open' });
  });

  it('keeps the door a tile moves with', () => {
    const tile = { kind: 'image', id: 'leaf', x: 0, y: 0, w: 1, h: 1, src: '/a.webp' };
    const door = { wall: 'w1', style: 'swing' };
    const placed = intoWhole('tiles', { ...tile, door } as Chunk['tiles'][number], part);
    expect((placed as { door: { wall: string } }).door.wall).toBe(partId('market', 'w1'));
    expect(intoPart('tiles', placed, part)).toEqual({ ...tile, door });
  });

  it('moves a light', () => {
    const light = { id: 'lamp', x: 10, y: 20, bright: 20, dim: 40 } as Chunk['lights'][number];
    expect(intoWhole('lights', light, part)).toMatchObject({ id: 'market--lamp', x: 3010, y: -1480 });
  });

  it('tells which scenes can be laid on a scene', () => {
    const scenes = new Map([
      ['city', { gridSize: 150, parts: [part] }],
      ['market', { gridSize: 150 }],
      ['docks', { gridSize: 150 }],
      ['cave', { gridSize: 100 }],
      ['town', { gridSize: 150, parts: [{ scene: 'docks', x: 0, y: 0 }] }],
    ]);
    expect([...scenes.keys()].filter((id) => canBePart('city', id, scenes))).toEqual(['docks']);
  });

  it('names what is wrong with the parts of a scene', () => {
    const scenes = new Map([
      ['city', { gridSize: 150, parts: [part, { scene: 'city', x: 0, y: 0 }, { scene: 'gone', x: 0, y: 0 }] }],
      ['market', { gridSize: 100 }],
      ['nest', { gridSize: 150, parts: [{ scene: 'market', x: 0, y: 0 }] }],
      [
        'outer',
        {
          gridSize: 150,
          parts: [
            { scene: 'nest', x: 0, y: 0 },
            { scene: 'nest', x: 9, y: 9 },
          ],
        },
      ],
    ]);
    expect(partErrors('city', scenes)).toEqual([
      'part "market" has a grid of 100 px, the scene 150 px',
      'a scene cannot be a part of itself',
      'part "gone" is not a scene of this game',
    ]);
    expect(partErrors('outer', scenes)).toEqual(['part "nest" is made of parts itself', 'part "nest" is placed twice']);
    expect(partErrors('market', scenes)).toEqual([]);
  });
});

describe('the rest of a part: regions, notes, sounds and drawings', () => {
  it('lays a document by its points or its place, under an id of its own', () => {
    const region = {
      id: 'mud',
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
      behaviors: [],
    };
    expect(docIntoWhole(region, part)).toEqual({
      id: 'market--mud',
      part: 'market',
      points: [
        [3000, -1500],
        [3100, -1500],
        [3100, -1400],
      ],
      behaviors: [],
    });
    expect(docIntoWhole({ id: 'pin', x: 10, y: 20, label: 'Inn' }, part)).toEqual({
      id: 'market--pin',
      part: 'market',
      x: 3010,
      y: -1480,
      label: 'Inn',
    });
  });

  it('lists a collection of the whole scene: its own, then each part’s', () => {
    const colls: Record<string, { id: string; x: number; y: number }[]> = {
      'city/notes': [{ id: 'gate', x: 1, y: 2 }],
      'market/notes': [{ id: 'pin', x: 10, y: 20 }],
    };
    const laid = laidDocs(
      { id: 'city', parts: [part, { scene: 'docks', x: 0, y: 0 }] },
      'notes',
      (c) => colls[c] ?? [],
    );
    expect(laid).toEqual([
      { id: 'gate', x: 1, y: 2 },
      { id: 'market--pin', part: 'market', x: 3010, y: -1480 },
    ]);
  });

  it('knows where an item of the whole scene is kept', () => {
    expect(homeOf('city', { id: 'gate' })).toEqual({ scene: 'city', id: 'gate' });
    expect(homeOf('city', { id: 'market--pin', part: 'market' })).toEqual({ scene: 'market', id: 'pin' });
  });
});
