import { describe, expect, it } from 'vitest';
import { roofAlpha } from './tile-motion.ts';
import { tilePose } from './tile-pose.ts';

// A tile turned about its centre and mirrored, like Foundry's.

describe('tile pose', () => {
  it('stands a plain tile at its corner', () => {
    expect(tilePose({ x: 100, y: 200, w: 400, h: 200 })).toEqual({
      position: [100, 200],
      pivot: [0, 0],
      angle: 0,
      scale: [1, 1],
    });
  });

  it('turns and mirrors a tile about its centre', () => {
    expect(tilePose({ x: 100, y: 200, w: 400, h: 200, rotation: 90, flipX: true })).toEqual({
      position: [300, 300],
      pivot: [200, 100],
      angle: 90,
      scale: [-1, 1],
    });
  });
});

describe('a turned roof', () => {
  it('fades for creatures under where it is drawn, not under its unturned rectangle', () => {
    const roof = { x: 0, y: 0, w: 400, h: 100, rotation: 90 };
    // Turned a quarter, it covers x 150-250, y -150-250.
    expect(roofAlpha(roof, [[200, -100]])).toBe(0);
    expect(roofAlpha(roof, [[50, 50]])).toBe(1);
  });
});
