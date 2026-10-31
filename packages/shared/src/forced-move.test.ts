import { describe, expect, it } from 'vitest';
import { forcedMove } from './forced-move.ts';
import type { Point, Wall } from './schema.ts';

const g = 100;
const at = (col: number, row: number): Point => [(col + 0.5) * g, (row + 0.5) * g];
const wall = (a: Point, b: Point): Wall => ({ id: 'w', a, b });

function move(over: Partial<Parameters<typeof forcedMove>[0]> = {}) {
  return forcedMove({ from: at(0, 0), start: at(1, 0), feet: 10, gridSize: g, walls: [], taken: () => false, ...over });
}

describe('forcedMove', () => {
  it('pushes a creature straight away from the source, a square per 5 feet', () => {
    expect(move()).toEqual([at(1, 0), at(2, 0), at(3, 0)]);
  });

  it('pushes diagonally when the source is on a diagonal', () => {
    expect(move({ from: at(0, 0), start: at(1, 1) })).toEqual([at(1, 1), at(2, 2), at(3, 3)]);
  });

  it('follows the nearest squares on a shallow angle', () => {
    expect(move({ start: at(2, 1), feet: 20 })).toEqual([at(2, 1), at(3, 2), at(4, 2), at(5, 3), at(6, 3)]);
  });

  it('stops at a wall', () => {
    expect(move({ walls: [wall([300, 0], [300, 100])] })).toEqual([at(1, 0), at(2, 0)]);
  });

  it('goes through an open door', () => {
    expect(move({ walls: [{ ...wall([300, 0], [300, 100]), door: 'open' }] })).toHaveLength(3);
  });

  it('stops before a square another creature stands in', () => {
    expect(move({ taken: (p) => p[0] === at(3, 0)[0] && p[1] === at(3, 0)[1] })).toEqual([at(1, 0), at(2, 0)]);
  });

  it('pulls toward the source and stops next to it', () => {
    const taken = (p: Point) => p[0] === at(0, 0)[0] && p[1] === at(0, 0)[1];
    expect(move({ start: at(4, 0), feet: -10, taken })).toEqual([at(4, 0), at(3, 0), at(2, 0)]);
    expect(move({ start: at(2, 0), feet: -10, taken })).toEqual([at(2, 0), at(1, 0)]);
  });

  it('does nothing when the creature stands on the source', () => {
    expect(move({ start: at(0, 0) })).toEqual([at(0, 0)]);
  });
});
