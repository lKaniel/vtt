import { describe, expect, it } from 'vitest';
import { eyeOf, follow, groundSquare, ORBIT, panBy, pitchOf, rotateBy, type Orbit, zoomBy } from './orbit.ts';

// The BG3-style camera: it circles a point on the ground; zooming out lifts
// it from over the shoulder towards straight down, and the tactical view
// looks straight down.

const GRID = 100;
const start: Orbit = { target: [1000, 1000, 0], yaw: 0, distance: 1200, tactical: false };
const near = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 3));

describe('the orbit camera', () => {
  it('tilts from over the shoulder when close to looking down when far', () => {
    const close = pitchOf({ ...start, distance: ORBIT.minDistance * GRID }, GRID);
    const far = pitchOf({ ...start, distance: ORBIT.maxDistance * GRID }, GRID);
    expect(close).toBeCloseTo(ORBIT.lowPitch);
    expect(far).toBeCloseTo(ORBIT.highPitch);
    expect(pitchOf({ ...start, tactical: true }, GRID)).toBeCloseTo(ORBIT.tacticalPitch);
  });

  it('stands south of the point it looks at, facing north, until turned', () => {
    const eye = eyeOf(start, GRID);
    expect(eye[0]).toBeCloseTo(1000);
    expect(eye[1]).toBeGreaterThan(1000);
    expect(eye[2]).toBeGreaterThan(0);
    const turned = eyeOf(rotateBy(start, Math.PI / 2), GRID);
    expect(turned[0]).toBeGreaterThan(1000);
    expect(turned[1]).toBeCloseTo(1000);
  });

  it('zooms within its limits', () => {
    expect(zoomBy(start, -100, GRID).distance).toBe(ORBIT.minDistance * GRID);
    expect(zoomBy(start, 100, GRID).distance).toBe(ORBIT.maxDistance * GRID);
    expect(zoomBy(start, 1, GRID).distance).toBeGreaterThan(start.distance);
  });

  it('pans along the way it faces', () => {
    near(panBy(start, [0, -100]).target, [1000, 900, 0]);
    near(panBy(start, [100, 0]).target, [1100, 1000, 0]);
    near(panBy(rotateBy(start, Math.PI / 2), [0, -100]).target, [900, 1000, 0]);
  });

  it('glides towards a creature it follows', () => {
    const moved = follow(start, [2000, 1000, 0], 0.1);
    expect(moved.target[0]).toBeGreaterThan(1000);
    expect(moved.target[0]).toBeLessThan(2000);
    expect(follow(start, [2000, 1000, 0], 10).target[0]).toBeCloseTo(2000);
  });

  it('covers the ground it sees with a square around the target, no bigger than the cap', () => {
    const top = groundSquare({ ...start, tactical: true }, { fov: 45, aspect: 1, grid: GRID });
    expect(top.center[0]).toBeCloseTo(1000, 0);
    expect(top.center[1]).toBeCloseTo(1000, -1);
    expect(top.half).toBeGreaterThan(400);
    expect(top.half).toBeLessThan(800);
    const low = groundSquare({ ...start, distance: 400 }, { fov: 45, aspect: 2, grid: GRID });
    expect(low.half).toBeLessThanOrEqual(ORBIT.maxReach * GRID);
    expect(low.center[1]).toBeLessThan(1000);
  });
});

describe('zooming out', () => {
  it('goes far enough to see a whole 100-square map', () => {
    expect(zoomBy(start, 1000, GRID).distance).toBeGreaterThanOrEqual(100 * GRID);
  });
});
