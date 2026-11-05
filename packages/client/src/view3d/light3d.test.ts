import { describe, expect, it } from 'vitest';
import { skyShare } from './light3d.ts';

// How much of the sky's light (the sky light, the sun) falls on the scene:
// all of it at noon, a fifth at midnight, and inside a building no more than
// at midnight, so lamps light the rooms.

describe('skyShare', () => {
  it('dims with the darkness of the hour', () => {
    expect(skyShare(0, false)).toBe(1);
    expect(skyShare(1, false)).toBeCloseTo(0.2);
    expect(skyShare(0.5, false)).toBeCloseTo(0.6);
  });

  it('keeps the sky out while your creature is inside', () => {
    expect(skyShare(0, true)).toBeCloseTo(0.2);
    expect(skyShare(1, true)).toBeCloseTo(0.2);
  });
});
