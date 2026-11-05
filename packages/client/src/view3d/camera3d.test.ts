import { describe, expect, it } from 'vitest';
import { Follow, glideBy } from './camera3d.ts';

// The 3D camera keeps with the creature you act with (BG3): W A S D or a
// right drag take it away to look round, and it comes back once that
// creature moves, another is picked, or Home is pressed.

describe('following your creature', () => {
  it('follows the creature picked', () => {
    const f = new Follow();
    expect(f.watch('bram', [100, 100])).toBe(true);
  });

  it('stays where you moved it while the creature stands still', () => {
    const f = new Follow();
    f.watch('bram', [100, 100]);
    f.leave();
    expect(f.watch('bram', [100, 100])).toBe(false);
    expect(f.watch('bram', [100.4, 100])).toBe(false);
  });

  it('snaps back once the creature moves, or another is picked, or on Home', () => {
    const f = new Follow();
    f.watch('bram', [100, 100]);
    f.leave();
    expect(f.watch('bram', [140, 100])).toBe(true);
    f.leave();
    expect(f.watch('ana', [500, 100])).toBe(true);
    f.leave();
    f.back();
    expect(f.watch('ana', [500, 100])).toBe(true);
  });

  it('follows nothing with no creature', () => {
    expect(new Follow().watch(undefined, undefined)).toBe(false);
  });
});

describe('moving the camera with the keys', () => {
  it('goes faster the farther out the camera is, the same speed any way', () => {
    const near = glideBy([0, -1], 1, { distance: 1000, grid: 100 });
    const far = glideBy([0, -1], 1, { distance: 5000, grid: 100 });
    expect(near[1]).toBeLessThan(0);
    expect(Math.abs(far[1])).toBeGreaterThan(Math.abs(near[1]));
    const slant = glideBy([1, -1], 1, { distance: 1000, grid: 100 });
    expect(Math.hypot(...slant)).toBeCloseTo(Math.abs(near[1]));
  });
});
