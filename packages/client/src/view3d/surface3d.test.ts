import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Surface } from './surface3d.ts';

// What a creature stands on in 3D: the terrain or model surface under it.

/** A flat slab whose top is at `top`, over x and z 0–1000. */
const slab = (top: number) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1000, 10, 1000), new THREE.MeshBasicMaterial());
  m.position.set(500, top - 5, 500);
  m.updateMatrixWorld();
  return m;
};

describe('the surface under a creature', () => {
  it('is the first one below its feet, reaching a step up', () => {
    const ground = slab(170);
    const bridge = slab(400);
    const surface = new Surface(
      () => [ground, bridge],
      () => 60,
    );
    expect(surface.under('a', [100, 100], 300)).toBeCloseTo(170);
    expect(surface.under('b', [100, 100], 380)).toBeCloseTo(400);
    expect(surface.under('c', [100, 100], 600)).toBeCloseTo(400);
  });

  it('is the top one when the creature is under everything, and none off the ground', () => {
    const surface = new Surface(
      () => [slab(170)],
      () => 60,
    );
    expect(surface.under('a', [100, 100], 0)).toBeCloseTo(170);
    expect(surface.under('a', [5000, 100], 0)).toBeUndefined();
  });
});
