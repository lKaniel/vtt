import { describe, expect, it } from 'vitest';
import { Solid3DSchema, solidOutline, solidSpan } from './solid3d.ts';

// A drawn 3D shape on a tile (3D Canvas's polygons): an outline across the
// tile, raised as tall as asked from its elevation.

const square = {
  points: [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ] as [number, number][],
  height: 10,
};

describe('solid shapes on tiles', () => {
  it('need an outline of at least three corners inside the tile, and a height', () => {
    expect(Solid3DSchema.parse(square)).toEqual(square);
    expect(
      Solid3DSchema.safeParse({
        ...square,
        points: [
          [0, 0],
          [1, 1],
        ],
      }).success,
    ).toBe(false);
    expect(
      Solid3DSchema.safeParse({
        ...square,
        points: [
          [0, 0],
          [2, 0],
          [1, 1],
        ],
      }).success,
    ).toBe(false);
    expect(Solid3DSchema.safeParse({ ...square, height: 0 }).success).toBe(false);
  });

  it('stretch their outline over the tile, turned with it', () => {
    const rect = { x: 100, y: 200, w: 400, h: 200 };
    expect(solidOutline(rect, square)).toEqual([
      [100, 200],
      [500, 200],
      [500, 400],
      [100, 400],
    ]);
    const turned = solidOutline(rect, { ...square, rotation: 90 }).map(([x, y]) => [Math.round(x), Math.round(y)]);
    expect(turned).toEqual([
      [400, 100],
      [400, 500],
      [200, 500],
      [200, 100],
    ]);
  });

  it('stand from their elevation, or the floor shown, as tall as asked', () => {
    const ground = { grid: 100, feet: 5, floor: 10 };
    expect(solidSpan(square, ground)).toEqual({ base: 0, height: 200 });
    expect(solidSpan({ ...square, elevation: 15 }, ground)).toEqual({ base: 100, height: 200 });
  });
});
