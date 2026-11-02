import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { dieShape, restingTurn } from './dice-shapes.ts';

describe('dice shapes', () => {
  it('have one face group per side, each with its outward normal', () => {
    for (const sides of [4, 6, 8, 10, 12, 20] as const) {
      const shape = dieShape(sides);
      expect(shape.normals).toHaveLength(sides);
      expect(new Set(shape.geometry.groups.map((g) => g.materialIndex)).size).toBe(sides);
      const pos = shape.geometry.getAttribute('position');
      for (const g of shape.geometry.groups) {
        const centre = new Vector3();
        for (let i = g.start; i < g.start + g.count; i++) centre.add(new Vector3().fromBufferAttribute(pos, i));
        // Outward: the normal points the same way as the face's centre from the die's.
        expect(shape.normals[g.materialIndex!]!.dot(centre)).toBeGreaterThan(0);
      }
    }
  });

  it('come to rest with the rolled face looking at the camera', () => {
    for (const sides of [4, 6, 8, 10, 12, 20] as const) {
      const shape = dieShape(sides);
      const face = sides - 1;
      const up = shape.normals[face]!.clone().applyQuaternion(restingTurn(shape.normals[face]!, 1.2));
      expect(up.distanceTo(new Vector3(0, 0, 1))).toBeLessThan(1e-6);
    }
  });
});
