import { describe, expect, it } from 'vitest';
import {
  type Heightmap,
  heightmapAt,
  type Terrain3D,
  Terrain3DSchema,
  terrainCells,
  terrainLift,
} from './terrain3d.ts';

// A 4×2 picture whose red rises left to right: 0, 85, 170, 255 on both rows.
const ramp: Heightmap = { width: 4, height: 2, red: (x) => [0, 85, 170, 255][x]! };
const terrain = (more: Partial<Terrain3D> = {}): Terrain3D => ({ heightmap: '/h.webp', height: 50, ...more });

describe('terrain heightmaps', () => {
  it('reads black as high, or white with highIsWhite', () => {
    expect(heightmapAt(ramp, [0, 0], terrain())).toBe(1);
    expect(heightmapAt(ramp, [0.99, 0], terrain())).toBe(0);
    expect(heightmapAt(ramp, [0.99, 0], terrain({ highIsWhite: true }))).toBe(1);
  });

  it('reads a window of the picture (u = a + u/c), wrapping round', () => {
    const half = terrain({ highIsWhite: true, window: [0.5, 0, 2, 1] });
    expect(heightmapAt(ramp, [0, 0], half)).toBeCloseTo(170 / 255);
    expect(heightmapAt(ramp, [0.99, 0], half)).toBe(1);
    const wrapped = terrain({ highIsWhite: true, window: [0.75, 0, 1, 1] });
    expect(heightmapAt(ramp, [0.5, 0], wrapped)).toBeCloseTo(85 / 255);
  });

  it('has detail segments a square, at least one each way', () => {
    expect(terrainCells({ w: 4000, h: 3000 }, terrain({ detail: 2 }), 100)).toEqual([80, 60]);
    expect(terrainCells({ w: 50, h: 50 }, terrain(), 100)).toEqual([1, 1]);
    expect(terrainCells({ w: 100000, h: 100000 }, terrain(), 100)).toEqual([256, 256]);
  });

  it('stretches the heights so the highest peak stands `height` feet up', () => {
    const half: Heightmap = { width: 2, height: 1, red: (x) => [0, 128][x]! };
    const spots = [
      [0, 0],
      [0.5, 0],
      [1, 0],
    ] as const;
    // 0, 128/255, and the far edge wraps round to 0: the middle is the peak.
    expect(terrainLift(half, spots, terrain({ highIsWhite: true })).map((v) => Math.round(v))).toEqual([0, 50, 0]);
  });

  it('lies flat when the picture is', () => {
    const flat: Heightmap = { width: 1, height: 1, red: () => 0 };
    expect(
      terrainLift(
        flat,
        [
          [0, 0],
          [1, 1],
        ],
        terrain({ highIsWhite: true }),
      ),
    ).toEqual([0, 0]);
  });

  it('checks its fields', () => {
    expect(Terrain3DSchema.safeParse(terrain({ layers: [{ from: 0, color: '#fff' }] })).success).toBe(true);
    expect(Terrain3DSchema.safeParse(terrain({ height: 0 })).success).toBe(false);
  });
});
