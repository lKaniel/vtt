import { describe, expect, it } from 'vitest';
import { BLANK, foundryScene } from './foundry-scene.ts';

// 3D Canvas's drawn shapes on a scene: tiles with the blank picture whose
// flags draw a polygon, a box or a cylinder become tiles with a `solid`.

const blank = 'modules/levels-3d-preview/assets/blank.webp';
const shape = (x: number, f: object) => ({
  texture: { src: blank },
  x,
  y: 0,
  width: 100,
  height: 100,
  flags: { 'levels-3d-preview': f },
});
const scene = {
  name: 'Cliffs',
  width: 1000,
  height: 1000,
  padding: 0,
  grid: { size: 100, distance: 5 },
  tiles: [
    shape(0, { model3d: '0,0,100,0,50,100', dynaMesh: 'polygon', depth: 50 }),
    shape(200, { dynaMesh: 'box', depth: 100, color: '#556b2f' }),
    shape(400, { dynaMesh: 'cone', depth: 100 }),
  ],
};

describe('3D Canvas drawn shapes', () => {
  it('become tiles with a solid, invisible on the 2D map; the ones we cannot draw are reported', () => {
    const { scene: s, skipped } = foundryScene(scene, () => undefined);
    const solids = s.tiles.filter((t) => 'solid' in t && t.solid);
    expect(solids).toMatchObject([
      {
        x: 0,
        src: BLANK,
        solid: {
          points: [
            [0, 0],
            [1, 0],
            [0.5, 1],
          ],
          height: 2.5,
        },
      },
      { x: 200, solid: { height: 5, color: '#556b2f' } },
    ]);
    expect(skipped.find((l) => l.what.includes("shape we can't draw"))?.count).toBe(1);
  });

  it('splits a merged tile into its copies, each at its own size and spot, keeping the model origin as Foundry does', () => {
    const merged = {
      texture: { src: blank },
      x: 1000,
      y: 1000,
      width: 3000,
      height: 2000,
      elevation: 10,
      flags: {
        'levels-3d-preview': {
          model3d: 'modules/kit/acolyte.glb',
          depth: 180,
          fillType: 'stretch',
          autoGround: true,
          mergedMatrix: [
            { width: 0.064, height: 0.055, depth: 0.18, x: 2, y: 0, z: 0, rotation: 352, tiltX: 0, tiltZ: 0 },
            {
              width: 0.064,
              height: 0.055,
              depth: 0.18,
              x: 0,
              y: 0.6,
              z: 0.1,
              rotation: 0,
              tiltX: -180,
              tiltZ: -180,
              color: '#ff0000',
            },
          ],
          originalDimensions: { width: 3, height: 2, depth: 0.18 },
        },
      },
    };
    const found = (p: string) => (p.endsWith('.glb') ? `/assets/foundry/${p}` : undefined);
    const tiles = foundryScene({ ...scene, tiles: [merged] }, found).scene.tiles;
    expect(tiles).toMatchObject([
      {
        x: 3000,
        y: 1000,
        w: 64,
        h: 55,
        model: { height: 9, elevation: 10, rotation: 352, center: false },
      },
      {
        x: 1000,
        y: 1600,
        w: 64,
        h: 55,
        model: { height: 9, elevation: 15, tilt: [-180, -180], color: '#ff0000', center: false },
      },
    ]);
    expect(tiles[0]).not.toHaveProperty('model.ground');
  });
});
