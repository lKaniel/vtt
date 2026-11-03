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
});
