import { describe, expect, it } from 'vitest';
import { densify, isGridless, segmentsIntersect, type Wall, walkPath } from './index.ts';

const G = 100;
const free = { gridSize: G, gridless: true, radius: 50, bodies: [] };
const squares = { ...free, gridless: false };

describe('isGridless', () => {
  it('is gridless unless the scene asks for squares', () => {
    expect(isGridless({})).toBe(true);
    expect(isGridless({ grid: 'none' })).toBe(true);
    expect(isGridless({ grid: 'square' })).toBe(false);
  });
});

describe('walkPath without a grid', () => {
  it('walks straight to the exact point, measured in feet', () => {
    const p = walkPath([50, 50], [337, 450], [], free)!;
    expect(p.points).toEqual([
      [50, 50],
      [337, 450],
    ]);
    expect(p.feet).toBe(Math.round((Math.hypot(287, 400) / G) * 5));
  });

  it('goes around a wall', () => {
    const wall: Wall = { id: 'w', a: [300, -200], b: [300, 300] };
    const p = walkPath([50, 50], [550, 50], [wall], free)!;
    expect(p.points.at(-1)).toEqual([550, 50]);
    expect(p.feet).toBeGreaterThan(25);
    for (let i = 1; i < p.points.length; i++) {
      expect(segmentsIntersect(p.points[i - 1]!, p.points[i]!, wall.a, wall.b)).toBe(false);
    }
  });

  it("can't stop inside another creature", () => {
    const bodies = [{ x: 500, y: 50, r: 50 }];
    expect(walkPath([50, 50], [520, 60], [], { ...free, bodies })).toBeNull();
  });

  it('walks around another creature instead of through it', () => {
    const bodies = [{ x: 300, y: 50, r: 50 }];
    const p = walkPath([50, 50], [550, 50], [], { ...free, bodies })!;
    expect(p.points.at(-1)).toEqual([550, 50]);
    expect(p.points.length).toBeGreaterThan(2);
    for (const q of densify(p.points, 5)) expect(Math.hypot(q[0] - 300, q[1] - 50)).toBeGreaterThanOrEqual(99);
  });

  it('may stand right next to another creature', () => {
    const bodies = [{ x: 300, y: 50, r: 50 }];
    expect(walkPath([50, 50], [200, 50], [], { ...free, bodies })!.feet).toBe(8);
  });

  it('lets a creature step out of one it already overlaps', () => {
    const bodies = [{ x: 60, y: 50, r: 50 }];
    expect(walkPath([50, 50], [50, 400], [], { ...free, bodies })).not.toBeNull();
  });

  it('is null when walled in', () => {
    const box: Wall[] = [
      { id: 'n', a: [0, 0], b: [300, 0] },
      { id: 'w', a: [0, 0], b: [0, 300] },
      { id: 's', a: [0, 300], b: [300, 300] },
      { id: 'e', a: [300, 0], b: [300, 300] },
    ];
    expect(walkPath([150, 150], [550, 150], box, { ...free, margin: 4 })).toBeNull();
  });

  it('pays double on difficult ground', () => {
    const cost = (p: [number, number]) => (p[0] > 300 ? 2 : 1);
    expect(walkPath([0, 0], [600, 0], [], { ...free, cost })!.feet).toBe(45);
  });
});

describe('walkPath on a square grid', () => {
  it('snaps to squares and counts diagonals as 5 ft', () => {
    const p = walkPath([50, 50], [337, 360], [], squares)!;
    expect(p.points.at(-1)).toEqual([350, 350]);
    expect(p.feet).toBe(15);
  });

  it('steps around squares other creatures stand on', () => {
    const bodies = [{ x: 250, y: 50, r: 50 }];
    const p = walkPath([50, 50], [450, 50], [], { ...squares, bodies })!;
    expect(p.points).not.toContainEqual([250, 50]);
    expect(walkPath([50, 50], [250, 50], [], { ...squares, bodies })).toBeNull();
  });
});

describe('densify', () => {
  it('adds points so no step is longer than asked', () => {
    expect(
      densify(
        [
          [0, 0],
          [10, 0],
        ],
        4,
      ),
    ).toEqual([
      [0, 0],
      [10 / 3, 0],
      [20 / 3, 0],
      [10, 0],
    ]);
  });
});
