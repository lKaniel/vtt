import type { Heightmap, Terrain3D } from '@vtt/shared';
import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { terrainGeometry, Terrains } from './terrain3d.ts';

// 3D Canvas terrain in the 3D view: a box whose top (and the top of its
// sides) a heightmap raises, the highest spot `height` feet over its bottom.

// Red rises west to east: white (high) on the east edge's left neighbour.
const ramp: Heightmap = { width: 4, height: 1, red: (x) => [0, 85, 170, 255][x]! };
const terrain: Terrain3D = { heightmap: '/h.webp', height: 50, highIsWhite: true };

describe('terrain in 3D', () => {
  it('raises a box over the tile, its bottom flat and its peak `height` up', () => {
    const g = terrainGeometry({ w: 400, h: 300 }, terrain, ramp, { grid: 100, px: 20 });
    g.computeBoundingBox();
    const box = g.boundingBox!;
    expect([box.min.x, box.max.x, box.min.z, box.max.z]).toEqual([-200, 200, -150, 150]);
    expect(box.min.y).toBe(0);
    expect(box.max.y).toBeCloseTo(1000);
  });

  it('stands higher where the picture is whiter, and carries how high (0–1) for the paint', () => {
    const g = terrainGeometry({ w: 400, h: 300 }, terrain, ramp, { grid: 100, px: 20 });
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const rise = g.getAttribute('rise') as THREE.BufferAttribute;
    const topAt = (x: number) => {
      let best = -1;
      for (let i = 0; i < pos.count; i++) if (pos.getX(i) === x) best = Math.max(best, pos.getY(i));
      return best;
    };
    expect(topAt(-200)).toBe(0);
    expect(topAt(100)).toBeCloseTo(1000);
    expect(topAt(-100)).toBeCloseTo(1000 / 3);
    for (let i = 0; i < pos.count; i++) expect(rise.getX(i)).toBeCloseTo(pos.getY(i) / 1000);
  });

  it('stands each terrain over its tile on the floor shown, turned with it, and finds the ground on it', async () => {
    const terrains = new Terrains(() => Promise.resolve(ramp));
    const shown = {
      key: 'hill',
      rect: { x: 1000, y: 500, w: 400, h: 300 },
      terrain: { ...terrain, elevation: 5, rotation: 90 },
    };
    const ground = { grid: 100, feet: 5, floor: 0 };
    terrains.show([shown], ground, 0);
    await Promise.resolve();
    await Promise.resolve();
    terrains.show([shown], ground, 0);
    expect(terrains.count).toBe(1);
    const mesh = terrains.meshes[0]!;
    expect(mesh.position.toArray()).toEqual([1200, 100, 650]);
    expect(mesh.rotation.y).toBeCloseTo(-Math.PI / 2);
    mesh.updateMatrixWorld();
    expect(terrains.heightAt(1200, 650)).toBeGreaterThan(100);
    expect(terrains.heightAt(0, 0)).toBeUndefined();
    terrains.show([], ground, 0);
    expect(terrains.count).toBe(0);
  });
});
