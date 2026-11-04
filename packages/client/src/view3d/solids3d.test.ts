import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { SolidShown } from './content3d.ts';
import { Solids } from './solids3d.ts';

// The 3D view's drawn solids: one mesh per shape, rising from its base.

const ground = { grid: 100, feet: 5, floor: 0 };
const ledge = (key: string, elevation?: number): SolidShown => ({
  key,
  outline: [
    [0, 0],
    [100, 0],
    [0, 100],
  ],
  solid: {
    points: [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
    height: 10,
    ...(elevation === undefined ? {} : { elevation }),
  },
});
const heights = (s: Solids) => s.group.children.map((m) => Math.round(m.position.y));
const box = (m: THREE.Object3D) => new THREE.Box3().setFromObject(m);

describe('solids in the 3D view', () => {
  it('raise each outline as tall as asked from its base, and drop the ones gone', () => {
    const solids = new Solids();
    solids.show([ledge('a'), ledge('b', 5)], ground, 50);
    expect(solids.count).toBe(2);
    expect(heights(solids)).toEqual([50, 150]);
    const b = box(solids.group.children[0]!);
    expect([b.min.y, b.max.y, b.min.z, b.max.z].map(Math.round)).toEqual([50, 250, 0, 100]);
    solids.show([ledge('b', 5)], ground, 50);
    expect(solids.count).toBe(1);
    solids.restand();
    solids.show([ledge('b', 5)], ground, 0);
    expect(heights(solids)).toEqual([100]);
    solids.dispose();
    expect(solids.count).toBe(0);
  });

  it('covers a solid in its picture, repeated across its width as often as asked', () => {
    const solids = new Solids(() => new THREE.Texture());
    const water = ledge('w');
    solids.show(
      [{ ...water, solid: { ...water.solid, texture: '/assets/water.webp', repeat: 10 } }, ledge('a')],
      ground,
      0,
    );
    const [lake, plain] = solids.group.children.map((m) => (m as THREE.Mesh).material as THREE.MeshStandardMaterial);
    expect(lake!.map?.repeat.toArray()).toEqual([0.1, 0.1]);
    expect(lake!.map?.wrapS).toBe(THREE.RepeatWrapping);
    expect(plain!.map).toBeNull();
    solids.dispose();
  });
});
