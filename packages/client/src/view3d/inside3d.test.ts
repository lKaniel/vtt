import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { insideOf } from './inside3d.ts';

// A house 600 × 400 px (30 × 20 ft) with 12 ft walls and a roof whose eaves
// hang 50 px past them, and a tree: a trunk under a wide crown. A foot is
// 20 px, a square 100.

const block = (x: [number, number], y: [number, number], z: [number, number]) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(x[1] - x[0], y[1] - y[0], z[1] - z[0]));
  mesh.position.set((x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2);
  mesh.updateMatrixWorld();
  return mesh;
};

const house = [
  block([1000, 1600], [0, 240], [990, 1000]),
  block([1000, 1600], [0, 240], [1400, 1410]),
  block([990, 1000], [0, 240], [1000, 1400]),
  // The east wall has a door.
  block([1600, 1610], [0, 240], [1000, 1150]),
  block([1600, 1610], [0, 240], [1250, 1400]),
  block([950, 1650], [260, 280], [950, 1450]),
];
const tree = [block([3000, 3040], [0, 300], [3000, 3040]), block([2800, 3240], [300, 400], [2800, 3240])];
const scale = { px: 20, grid: 100 };

describe('whether your creature is inside', () => {
  it('finds the house round it, as far as its roof goes', () => {
    const box = insideOf([...house, ...tree], { at: [1300, 1200], feet: 0 }, scale);
    expect(box).toBeDefined();
    expect(box!.min[0]).toBeGreaterThanOrEqual(850);
    expect(box!.min[0]).toBeLessThanOrEqual(1000);
    expect(box!.max[0]).toBeGreaterThanOrEqual(1600);
    expect(box!.max[0]).toBeLessThanOrEqual(1750);
    expect(box!.min[1]).toBeLessThanOrEqual(1000);
    expect(box!.max[1]).toBeGreaterThanOrEqual(1400);
    expect(box!.max[1]).toBeLessThanOrEqual(1550);
  });

  it('is inside standing in the doorway', () => {
    expect(insideOf(house, { at: [1580, 1200], feet: 0 }, scale)).toBeDefined();
  });

  it('is not inside under the eaves, beside the wall', () => {
    expect(insideOf(house, { at: [970, 1200], feet: 0 }, scale)).toBeUndefined();
  });

  it('is not inside under a tree, or out in the open', () => {
    expect(insideOf(tree, { at: [2950, 3020], feet: 0 }, scale)).toBeUndefined();
    expect(insideOf(house, { at: [2000, 2000], feet: 0 }, scale)).toBeUndefined();
  });

  it('is not inside on the roof', () => {
    expect(insideOf(house, { at: [1300, 1200], feet: 280 }, scale)).toBeUndefined();
  });
});

describe('what counts as a building', () => {
  it('leaves out creatures’ figures and hidden things', () => {
    const figure = new THREE.Group().add(block([1250, 1350], [150, 400], [1150, 1250]));
    figure.userData.figure = true;
    const hidden = block([1200, 1400], [200, 260], [1100, 1300]);
    hidden.visible = false;
    expect(insideOf([figure, hidden], { at: [1300, 1200], feet: 0 }, scale)).toBeUndefined();
  });
});
