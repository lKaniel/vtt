import type { DrawnTile, WorldInfo } from '@vtt/shared';
import type { TokenView } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { figures, paintedUnder3d, tileModels, tileSolids, tileTerrains } from './content3d.ts';

// The 3D view stands the model tiles of the floors shown, where a player has
// explored, and creatures with a figure over their square.

const world = {
  gridSize: 100,
  levels: [
    { id: 'ground', name: 'Ground', bottom: 0 },
    { id: 'loft', name: 'Loft', bottom: 10 },
  ],
} as unknown as WorldInfo;

const tile = (id: string, more: Partial<DrawnTile> = {}): DrawnTile =>
  ({
    id,
    kind: 'image',
    x: 0,
    y: 0,
    w: 200,
    h: 100,
    src: 'blank.svg',
    model: { src: `${id}.glb` },
    ...more,
  }) as DrawnTile;

describe('what the 3D view stands up', () => {
  it('stands the model tiles on the floors shown', () => {
    const tiles = [tile('bridge'), tile('roof', { level: 'loft' }), tile('flat', { model: undefined })];
    const shown = tileModels(tiles, { world, shown: ['ground'] });
    expect(shown.map((m) => m.model.src)).toEqual(['bridge.glb']);
    expect(shown[0]!.rect).toEqual({ x: 0, y: 0, w: 200, h: 100 });
  });

  it('raises the drawn solids of the floors shown, outlined on the map', () => {
    const solid = {
      points: [
        [0, 0],
        [1, 0],
        [0, 1],
      ] as [number, number][],
      height: 10,
    };
    const tiles = [
      tile('cliff', { model: undefined, solid, x: 100 }),
      tile('loft-ledge', { model: undefined, solid, level: 'loft' }),
      tile('bridge'),
    ];
    const shown = tileSolids(tiles, { world, shown: ['ground'] });
    expect(shown.map((s) => s.key.startsWith('tile:cliff:'))).toEqual([true]);
    expect(shown.map(({ outline, solid }) => ({ outline, solid }))).toEqual([
      {
        outline: [
          [100, 0],
          [300, 0],
          [100, 100],
        ],
        solid,
      },
    ]);
  });

  it('raises the terrain of the floors shown over its tile', () => {
    const terrain = { heightmap: '/hills.webp', height: 50 };
    const tiles = [
      tile('hills', { model: undefined, terrain, x: 100 }),
      tile('loft-hills', { model: undefined, terrain, level: 'loft' }),
      tile('bridge'),
    ];
    const shown = tileTerrains(tiles, { world, shown: ['ground'] });
    expect(shown.map(({ rect, terrain }) => ({ rect, terrain }))).toEqual([
      { rect: { x: 100, y: 0, w: 200, h: 100 }, terrain },
    ]);
  });

  it('leaves out what a player has not explored', () => {
    const tiles = [tile('near'), tile('far', { x: 5000 })];
    const shown = tileModels(tiles, { world, explored: ([x]) => x < 1000 });
    expect(shown.map((m) => m.model.src)).toEqual(['near.glb']);
  });

  it('stands a creature with a figure over its square, at its elevation', () => {
    const tokens = [
      { id: 'bram', size: 1, model: { src: 'bram.glb' }, elevation: 5 },
      { id: 'orrin', size: 1 },
    ] as unknown as TokenView[];
    const shown = figures(tokens, { world }, () => ({ at: [150, 250] }));
    expect(shown).toEqual([
      {
        key: 'token:bram:bram.glb',
        rect: { x: 100, y: 200, w: 100, h: 100 },
        model: { fill: 'fit', src: 'bram.glb', elevation: 5 },
      },
    ]);
  });
});

describe('the flat map under the 3D view', () => {
  const blank = '/art/ui/blank.svg';
  const flat = (id: string, more: Partial<DrawnTile> = {}) =>
    tile(id, { src: `/assets/${id}.webp`, model: undefined, ...more });
  it('paints the tiles lying on the ground, not what stands in 3D', () => {
    expect(paintedUnder3d(flat('rug'))).toBe(true);
    expect(paintedUnder3d(flat('tower', { src: blank, model: { src: '/assets/t.glb' } }))).toBe(false);
    expect(paintedUnder3d(flat('ledge', { src: blank, solid: { points: [], height: 5 } }))).toBe(false);
    expect(paintedUnder3d(flat('hill', { src: blank, terrain: { heightmap: '/h.png', height: 10 } }))).toBe(false);
  });

  it("paints the scene's background picture unless the scene's 3D look leaves it out", () => {
    const back = flat('background', { background: true });
    expect(paintedUnder3d(back)).toBe(true);
    expect(paintedUnder3d(back, { background: true })).toBe(true);
    expect(paintedUnder3d(back, { background: false })).toBe(false);
    expect(paintedUnder3d(flat('rug'), { background: false })).toBe(true);
  });

  it('leaves out a picture meant for the flat map only', () => {
    expect(paintedUnder3d(flat('top-down', { only2d: true }))).toBe(false);
  });
});
