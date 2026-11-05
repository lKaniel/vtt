import { describe, expect, it } from 'vitest';
import type { Point } from '@vtt/shared';
import { Climbing, climbEnd, climbFeet, type ClimbHost } from './climb3d.ts';

// A tower beside the road: stairs from x 100 to 200 rise a foot every 10
// pixels (a foot is 20 pixels up), then its top, 10 ft up, runs to x 400.
const PX = 20;
const tower = (x: number, _z: number, from = 0): number => {
  if (x < 100 || x > 400) return 0;
  const stair = Math.min(10, Math.floor((x - 100) / 10)) * PX;
  // Under the top, you walk on the ground; you get up there only by the stairs.
  return stair <= from + 2 * PX ? stair : 0;
};

describe('climbing in 3D', () => {
  it('walks up the stairs onto the top', () => {
    expect(
      climbEnd(
        [
          [0, 0],
          [300, 0],
        ],
        5,
        0,
        tower,
      ),
    ).toBe(10 * PX);
  });

  it('stays on the ground when it walks in under the top', () => {
    // The stairs are on the far side (z 50 to 100); the top hangs over the road.
    const farStairs = (x: number, z: number, from = 0) => {
      if (z >= 50) return tower(x, z, from);
      return x >= 200 && x <= 400 && from + 2 * PX >= 10 * PX ? 10 * PX : 0;
    };
    expect(
      climbEnd(
        [
          [0, 0],
          [300, 0],
        ],
        5,
        0,
        farStairs,
      ),
    ).toBe(0);
    expect(
      climbEnd(
        [
          [0, 60],
          [300, 60],
          [300, 0],
        ],
        5,
        0,
        farStairs,
      ),
    ).toBe(10 * PX);
  });

  it('comes down again', () => {
    expect(
      climbEnd(
        [
          [300, 0],
          [500, 0],
        ],
        5,
        10 * PX,
        tower,
      ),
    ).toBe(0);
  });

  it('says how high the walk ends in feet, when that changes it', () => {
    expect(climbFeet(10 * PX, PX, { elevation: 0, flying: false })).toBe(10);
    expect(climbFeet(10.2 * PX, PX, { elevation: 10, flying: false })).toBeUndefined();
    expect(climbFeet(0, PX, { elevation: 10, flying: false })).toBe(0);
  });

  it('leaves a flyer at its height', () => {
    expect(climbFeet(0, PX, { elevation: 30, flying: true })).toBeUndefined();
  });
});

describe('a creature climbing as it walks', () => {
  const host = (at: Point, more: Partial<ClimbHost> = {}): ClimbHost => ({
    token: (id) => (id === 'hero' ? { x: 0, y: 0, elevation: 0 } : undefined),
    placeOf: () => at,
    ground: ([x, z], from) => tower(x, z, from),
    route: () => undefined,
    px: () => PX,
    grid: () => 20,
    ...more,
  });

  it('ends a walk up the stairs on the top, by the way the preview showed', () => {
    const climbing = new Climbing(
      host([0, 0], {
        route: () => [
          [0, 0],
          [300, 0],
        ],
      }),
    );
    climbing.stood('hero', 0, false);
    expect(climbing.end('hero', [300, 0])).toBe(10);
  });

  it('leaves a flyer where it flies', () => {
    const climbing = new Climbing(host([0, 0]));
    climbing.stood('hero', 30 * PX, true);
    expect(climbing.end('hero', [300, 0])).toBeUndefined();
  });

  it('climbs step by step while the walk goes on, and lets go at rest', () => {
    let at: Point = [0, 0];
    const climbing = new Climbing(host([0, 0], { placeOf: () => at }));
    climbing.stood('hero', 0, false);
    const heights = [50, 110, 130, 150, 170, 190, 210, 300].map((x) => {
      at = [x, 0];
      return climbing.walking('hero', at);
    });
    expect(heights.at(-1)).toBe(10 * PX);
    expect(climbing.walking('hero', [0, 0])).toBeUndefined();
  });
});
