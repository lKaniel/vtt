import { describe, expect, it } from 'vitest';
import { anchorChunk, DrawnTileSchema, groupChunks, type PlacedLight, type Wall } from './index.ts';

const SIZE = 2000;

describe('anchorChunk', () => {
  it('puts a tile by its top-left corner, a wall by its midpoint and a light by its centre', () => {
    const tile = DrawnTileSchema.parse({ kind: 'rect', id: 't', x: 1990, y: 0, w: 500, h: 500, color: '#000' });
    const wall: Wall = { id: 'w', a: [1900, 0], b: [2300, 0] };
    const light = { id: 'l', x: -5, y: 10, bright: 10, dim: 0 } as PlacedLight;
    expect(anchorChunk('tiles', tile, SIZE)).toBe('0_0');
    expect(anchorChunk('walls', wall, SIZE)).toBe('1_0');
    expect(anchorChunk('lights', light, SIZE)).toBe('-1_0');
  });
});

describe('groupChunks', () => {
  it('splits a scene into the chunks the client streams, keeping file order', () => {
    const chunks = groupChunks(
      {
        tiles: [],
        walls: [
          { id: 'a', a: [0, 0], b: [100, 0] },
          { id: 'b', a: [2100, 0], b: [2200, 0] },
          { id: 'c', a: [0, 100], b: [100, 100] },
        ],
        lights: [],
      },
      SIZE,
    );
    expect([...chunks.keys()]).toEqual(['0_0', '1_0']);
    expect(chunks.get('0_0')!.walls.map((w) => w.id)).toEqual(['a', 'c']);
    expect(chunks.get('1_0')).toEqual({ tiles: [], walls: [{ id: 'b', a: [2100, 0], b: [2200, 0] }], lights: [] });
  });

  it('only builds the chunks asked for', () => {
    const walls: Wall[] = [
      { id: 'a', a: [0, 0], b: [100, 0] },
      { id: 'b', a: [2100, 0], b: [2200, 0] },
    ];
    const chunks = groupChunks({ tiles: [], walls, lights: [] }, SIZE, new Set(['1_0', '5_5']));
    expect([...chunks.keys()]).toEqual(['1_0', '5_5']);
    expect(chunks.get('5_5')).toEqual({ tiles: [], walls: [], lights: [] });
  });
});
