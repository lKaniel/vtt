import { describe, expect, it } from 'vitest';
import { foundryScene } from './foundry-scene.ts';

// How a Foundry tile looks beyond its rectangle: turned about its centre,
// mirrored (a negative texture scale), see-through, tinted, hidden, or a
// Better Roofs roof (v12+ store `brMode` as true).

const tile = (more: object) => ({
  texture: { src: 'modules/town/house.webp', ...('texture' in more ? (more.texture as object) : {}) },
  x: 100,
  y: 200,
  width: 400,
  height: 200,
  ...Object.fromEntries(Object.entries(more).filter(([k]) => k !== 'texture')),
});
const scene = (tiles: object[]) => ({
  name: 'Town',
  width: 1000,
  height: 1000,
  padding: 0,
  grid: { size: 100, distance: 5 },
  tiles,
});
const tilesOf = (tiles: object[]) =>
  foundryScene(scene(tiles), (p) => `pack://town/${p}`).scene.tiles.map((t) => {
    const { id: _id, kind: _kind, src: _src, ...rest } = t as Record<string, unknown>;
    return rest;
  });

describe('Foundry tiles keep their look', () => {
  it('keeps rotation, mirroring, opacity, tint and hidden', () => {
    expect(
      tilesOf([
        tile({ rotation: 270 }),
        tile({ rotation: 360, texture: { scaleX: -1, scaleY: 1 } }),
        tile({ texture: { scaleX: 1, scaleY: -1, tint: '#ff0000' }, alpha: 0.5, hidden: true }),
        tile({ rotation: 0, alpha: 1, hidden: false, texture: { scaleX: 1, scaleY: 1, tint: '#ffffff' } }),
      ]),
    ).toEqual([
      { x: 100, y: 200, w: 400, h: 200, rotation: 270 },
      { x: 100, y: 200, w: 400, h: 200, flipX: true },
      { x: 100, y: 200, w: 400, h: 200, flipY: true, tint: '#ff0000', alpha: 0.5, hidden: true },
      { x: 100, y: 200, w: 400, h: 200 },
    ]);
  });

  it('reads a Better Roofs roof stored as true', () => {
    const [roof] = tilesOf([tile({ flags: { betterroofs: { brMode: true } } })]);
    expect(roof).toMatchObject({ overhead: true });
  });

  it('places a v14 tile by its anchor: x and y are where the anchor is, turned about it', () => {
    const v14 = (tiles: object[]) =>
      foundryScene({ ...scene(tiles), _stats: { coreVersion: '14.367' } }, (p) => `pack://town/${p}`).scene.tiles.map(
        (t) => ('x' in t ? [t.x, t.y] : []),
      );
    expect(
      v14([
        tile({ texture: { anchorX: 0, anchorY: 0 } }),
        tile({ x: 300, y: 300, rotation: 270, texture: { anchorX: 0.5, anchorY: 0.5 } }),
        tile({ x: 100, y: 200, rotation: 90, texture: { anchorX: 0, anchorY: 0 } }),
      ]),
    ).toEqual([
      [100, 200],
      [100, 200],
      // Turned a quarter about its top-left corner, its centre is at (0, 400).
      [-200, 300],
    ]);
    // Before v14 x and y are the top-left corner, whatever the anchor says.
    expect(tilesOf([tile({ texture: { anchorX: 0.5, anchorY: 0.5 } })])[0]).toMatchObject({ x: 100, y: 200 });
  });
});

describe('Token Magic FX sprite tiles (Baileywiki’s Unlimited Terrain)', () => {
  const sprite = (params: object) => ({
    flags: {
      tokenmagic: {
        filters: [{ tmFilters: { tmFilterType: 'sprite', tmParams: { filterType: 'sprite', ...params } } }],
      },
    },
  });

  it('repeats the filter’s picture across the tile, sized, shifted and turned as Token Magic draws it', () => {
    const [ground] = tilesOf([
      tile(
        sprite({
          imagePath: 'modules/town/grass_tileable.webp',
          repeat: true,
          maintainScale: true,
          scaleX: 2,
          scaleY: 2,
          translationX: -1,
          translationY: 0.25,
          rotation: 120,
        }),
      ),
    ]);
    expect(ground).toMatchObject({
      repeat: { src: 'pack://town/modules/town/grass_tileable.webp', scale: 2, x: -1, y: 0.25, rotation: 120 },
    });
  });

  it('leaves a tile alone when its sprite doesn’t repeat or its picture is missing', () => {
    const lookup = (p: string) => (p.includes('gone') ? undefined : `pack://town/${p}`);
    const tiles = foundryScene(
      scene([
        tile(sprite({ imagePath: 'modules/town/a.webp', repeat: false })),
        tile(sprite({ imagePath: 'modules/town/gone.webp', repeat: true })),
      ]),
      lookup,
    ).scene.tiles;
    expect(tiles.map((t) => 'repeat' in t)).toEqual([false, false]);
  });
});
