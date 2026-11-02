import { describe, expect, it } from 'vitest';
import { tangent, wallCorners } from './any-angle.ts';
import { densify, isGridless, latticeOf, segmentsIntersect, type Wall, walkPath } from './index.ts';

const G = 100;
const free = { gridSize: G, gridless: true, radius: 50, bodies: [] };
const squares = { ...free, gridless: false };

describe('isGridless', () => {
  it('is gridless unless the scene asks for squares or hexes', () => {
    expect(isGridless({})).toBe(true);
    expect(isGridless({ grid: 'none' })).toBe(true);
    expect(isGridless({ grid: 'square' })).toBe(false);
    expect(isGridless({ grid: 'hex-cols' })).toBe(false);
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

  it('takes the shortest way round a creature, hugging it in a curve', () => {
    const bodies = [{ x: 300, y: 50, r: 50 }];
    const p = walkPath([50, 50], [550, 50], [], { ...free, bodies })!;
    // Two tangents of sqrt(250² - 100²) and the arc between them on the 100 px ring: 540.6 px.
    expect(p.feet).toBe(27);
    const onRing = p.points.filter((q) => Math.abs(Math.hypot(q[0] - 300, q[1] - 50) - 100) < 1);
    expect(onRing.length).toBeGreaterThan(3);
  });

  it('takes the shortest way round the end of a wall, rounding the corner', () => {
    const wall: Wall = { id: 'w', a: [300, -200], b: [300, 300] };
    const p = walkPath([50, 50], [550, 50], [wall], free)!;
    // Straight past the wall's end and on: 2 × hypot(250, 250) = 707 px, and a 15 px curve round it.
    expect(p.feet).toBeGreaterThanOrEqual(35);
    expect(p.feet).toBeLessThanOrEqual(37);
    const near = p.points.filter((q) => Math.hypot(q[0] - 300, q[1] - 300) < 20);
    expect(near.length).toBeGreaterThan(2);
  });

  it('threads between two creatures when that is shorter', () => {
    const bodies = [
      { x: 300, y: -60, r: 50 },
      { x: 300, y: 160, r: 50 },
    ];
    const p = walkPath([0, 50], [600, 50], [], { ...free, radius: 5, bodies })!;
    expect(p.feet).toBe(30);
  });

  it('goes through an open doorway rather than round the building', () => {
    const walls: Wall[] = [
      { id: 'a', a: [300, -1000], b: [300, 0] },
      { id: 'd', a: [300, 0], b: [300, 100], door: 'open' },
      { id: 'b', a: [300, 100], b: [300, 1000] },
    ];
    const p = walkPath([50, 300], [550, 300], walls, free)!;
    expect(p.feet).toBeLessThanOrEqual(33);
    for (const q of densify(p.points, 5)) expect(q[0] === 300 ? q[1] > 0 && q[1] < 100 : true).toBe(true);
  });

  it('still finds a way round a wall end it starts right beside', () => {
    // A room split by a wall from the top; the only way across is round its end.
    const walls: Wall[] = [
      { id: 'split', a: [300, -200], b: [300, 300] },
      { id: 'top-l', a: [300, -200], b: [-500, -200] },
      { id: 'top-r', a: [300, -200], b: [900, -200] },
      { id: 'left', a: [-500, -200], b: [-500, 600] },
      { id: 'right', a: [900, -200], b: [900, 600] },
      { id: 'floor', a: [-500, 600], b: [900, 600] },
    ];
    const p = walkPath([290, 295], [550, 50], walls, free)!;
    expect(p.points.at(-1)).toEqual([550, 50]);
    for (let i = 1; i < p.points.length; i++) {
      for (const w of walls) expect(segmentsIntersect(p.points[i - 1]!, p.points[i]!, w.a, w.b)).toBe(false);
    }
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

describe('walkPath on hexes', () => {
  const hex = latticeOf('hex-rows', G);
  const hexes = { ...squares, lattice: hex };

  it('walks hex to hex, every hex 5 ft', () => {
    const p = walkPath(hex.centre([0, 0]), hex.centre([3, 2]), [], hexes)!;
    expect(p.points[0]).toEqual(hex.centre([0, 0]));
    expect(p.points.at(-1)).toEqual(hex.centre([3, 2]));
    expect(p.feet).toBe(25);
    for (let i = 1; i < p.points.length; i++) {
      const [a, b] = [hex.cellOf(p.points[i - 1]!), hex.cellOf(p.points[i]!)];
      expect(hex.distance(a, b)).toBe(1);
    }
  });

  it('goes around a wall', () => {
    const wall: Wall = { id: 'w', a: [220, -400], b: [220, 300] };
    const p = walkPath(hex.centre([0, 0]), hex.centre([4, 0]), [wall], hexes)!;
    expect(p.feet).toBeGreaterThan(20);
    for (let i = 1; i < p.points.length; i++) {
      expect(segmentsIntersect(p.points[i - 1]!, p.points[i]!, wall.a, wall.b)).toBe(false);
    }
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

describe('wallCorners', () => {
  it('keeps the free ends of walls and the outside of bends, not the joins of a straight run', () => {
    const walls: Wall[] = [
      { id: 'a', a: [0, 0], b: [100, 0] },
      { id: 'b', a: [100, 0], b: [200, 0] },
      { id: 'c', a: [200, 0], b: [200, 100] },
      { id: 'o', a: [500, 0], b: [600, 0], door: 'open' },
    ];
    expect(wallCorners(walls, 10).map((d) => d.c)).toEqual([
      [0, 0],
      [200, 0],
      [200, 100],
    ]);
  });
});

describe('tangent', () => {
  it('leaves one disc and touches the other', () => {
    const line = tangent({ c: [0, 0], r: 0 }, 1, { c: [200, 0], r: 100 }, 1)!;
    expect(line.dep).toEqual([0, 0]);
    expect(Math.hypot(line.arr[0] - 200, line.arr[1])).toBeCloseTo(100);
    // The line meets the radius at a right angle.
    expect(line.arr[0] * (line.arr[0] - 200) + line.arr[1] * line.arr[1]).toBeCloseTo(0);
  });

  it('is null from inside a disc', () => {
    expect(tangent({ c: [150, 0], r: 0 }, 1, { c: [200, 0], r: 100 }, 1)).toBeNull();
  });
});
