import { describe, expect, it } from 'vitest';
import { arcOf, boltPath, flightAt, lungeAt, numberAt, shakeAt, type V3 } from './fx3d-motion.ts';

// How the 3D view's attack and spell effects move (effects3d.ts): missiles
// fly in arcs from chest to chest, a lunge steps toward the target and
// back, a struck creature shakes, and damage numbers pop up over its head.

const from: V3 = [0, 0, 50];
const to: V3 = [1000, 0, 50];

describe('3D effect motion', () => {
  it('flies a missile from one chest to the other, over an arc', () => {
    const arc = arcOf(from, to, 'arrow');
    expect(flightAt(from, to, 0, arc)).toEqual(from);
    expect(flightAt(from, to, 1, arc)).toEqual(to);
    const mid = flightAt(from, to, 0.5, arc);
    expect(mid[0]).toBeCloseTo(500);
    expect(mid[2]).toBeCloseTo(50 + arc);
  });

  it('arcs arrows higher than spells, and higher the farther they fly', () => {
    expect(arcOf(from, to, 'arrow')).toBeGreaterThan(arcOf(from, to, 'orb'));
    expect(arcOf(from, [2000, 0, 50], 'arrow')).toBeGreaterThan(arcOf(from, to, 'arrow'));
    expect(arcOf(from, to, 'bolt')).toBe(0);
  });

  it('steps toward the target and back in a lunge', () => {
    expect(lungeAt([1, 0], 0, 40)).toEqual([0, 0]);
    expect(lungeAt([1, 0], 0.5, 40)[0]).toBeCloseTo(40);
    expect(lungeAt([0, 1], 1, 40)[1]).toBeCloseTo(0);
  });

  it('shakes a struck creature less and less', () => {
    expect(Math.abs(shakeAt(0.95, 10))).toBeLessThan(1);
    expect(shakeAt(1, 10)).toBe(0);
  });

  it('pops a number up, lets it drift higher and fades it at the end', () => {
    const start = numberAt(0.04);
    const mid = numberAt(0.4);
    const end = numberAt(0.98);
    expect(mid.rise).toBeGreaterThan(start.rise);
    expect(start.alpha).toBe(1);
    expect(end.alpha).toBeLessThan(0.1);
    expect(mid.scale).toBeCloseTo(1);
  });

  it('runs a jagged bolt from end to end through points beside the line', () => {
    const path = boltPath(from, to, 8, () => 1);
    expect(path).toHaveLength(9);
    expect(path[0]).toEqual(from);
    expect(path[8]).toEqual(to);
    expect(path[4]![1]).not.toBe(0);
  });
});
