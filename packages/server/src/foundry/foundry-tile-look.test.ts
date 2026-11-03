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
});
