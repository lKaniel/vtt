import { describe, expect, it } from 'vitest';
import { cellsIn, gridKind, latticeOf } from './grid.ts';
import type { Point } from './schema.ts';

// The cells a gridded scene is cut into: 5 ft squares, or 5 ft hexes in
// rows (pointy top) or columns (flat top). gridSize is the distance between
// two neighbouring cells' centres either way.

const near = (p: Point) => p.map((v) => Math.round(v * 1000) / 1000);

describe('a scene’s grid', () => {
  it('is none unless it asks for squares or hexes', () => {
    expect(gridKind({})).toBe('none');
    expect(gridKind({ grid: 'square' })).toBe('square');
    expect(gridKind({ grid: 'hex-rows' })).toBe('hex-rows');
  });
});

describe('squares', () => {
  const sq = latticeOf('square', 100);

  it('have their centres on the half square and count diagonals as one step', () => {
    expect(sq.cellOf([250, 120])).toEqual([2, 1]);
    expect(sq.centre([2, 1])).toEqual([250, 150]);
    expect(sq.distance([0, 0], [3, 2])).toBe(3);
    expect(sq.steps).toHaveLength(8);
  });
});

describe('hexes in rows', () => {
  const hex = latticeOf('hex-rows', 100);
  const rowStep = 100 * (Math.sqrt(3) / 2);

  const radius = 100 / Math.sqrt(3);

  it('put each row half a hex over from the one above, the first hex in the top left corner', () => {
    expect(near(hex.centre([0, 0]))).toEqual(near([50, radius]));
    expect(near(hex.centre([0, 1]))).toEqual(near([100, radius + rowStep]));
    expect(hex.cellOf([104, radius + rowStep + 10])).toEqual([0, 1]);
    expect(hex.cellOf(hex.centre([-3, 5]))).toEqual([-3, 5]);
  });

  it('have six neighbours, each one step and gridSize away', () => {
    expect(hex.steps).toHaveLength(6);
    for (const [dq, dr] of hex.steps) {
      expect(hex.distance([0, 0], [dq, dr])).toBe(1);
      const [x, y] = hex.centre([dq, dr]);
      expect(Math.hypot(x - 50, y - radius)).toBeCloseTo(100);
    }
    expect(hex.distance([0, 0], [3, -1])).toBe(3);
    expect(hex.distance([0, 0], [2, 2])).toBe(4);
  });

  it('step through the hexes on the way, one at a time', () => {
    const way = hex.between([0, 0], [3, 0]);
    expect(way).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    expect(hex.between([0, 0], [2, 2])).toHaveLength(4);
  });

  it('have six corners around their centre, pointy at the top', () => {
    const corners = hex.corners([0, 0]);
    expect(corners).toHaveLength(6);
    expect(near(corners.find((c) => c[1] < 1e-9)!)).toEqual(near([50, 0]));
  });
});

describe('hexes in columns', () => {
  const hex = latticeOf('hex-cols', 100);

  it('put each column half a hex down from the one before, flat at the top', () => {
    const radius = 100 / Math.sqrt(3);
    expect(near(hex.centre([1, 0]))).toEqual(near([radius + 100 * (Math.sqrt(3) / 2), 100]));
    expect(hex.cellOf(hex.centre([4, -2]))).toEqual([4, -2]);
    expect(hex.corners([0, 0]).some(([x, y]) => Math.abs(y - 50) < 1e-9 && x > radius)).toBe(true);
  });
});

describe('the cells over part of the map', () => {
  it('cover every point of it, a few to spare', () => {
    const hex = latticeOf('hex-rows', 100);
    const rect = { x: 120, y: -40, w: 500, h: 300 };
    const cells = new Set(cellsIn(hex, rect).map((c) => c.join()));
    for (let x = rect.x; x <= rect.x + rect.w; x += 37) {
      for (let y = rect.y; y <= rect.y + rect.h; y += 41) expect(cells.has(hex.cellOf([x, y]).join())).toBe(true);
    }
    expect(cells.size).toBeLessThan(80);
  });
});
