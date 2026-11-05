import { describe, expect, it } from 'vitest';
import { chunkArea, GROUND, groundToDraw, groundDue, REACH, Resolution, tooSmallToSee } from './frame-budget.ts';

// What the 3D view saves each frame: the 2D map draws the ground again only
// when the camera leaves the square it drew (or something on it moves), the
// 3D picture drops resolution while frames are slow, and small things far
// off are not drawn.

describe('the ground the 2D map draws', () => {
  const need = { center: [1000, 1000] as [number, number], half: 500 };

  it('draws a square a little bigger than the one seen, so small moves need no new drawing', () => {
    const drawn = groundToDraw(need, undefined)!;
    expect(drawn.center).toEqual([1000, 1000]);
    expect(drawn.half).toBeCloseTo(500 * GROUND.margin);
    expect(groundToDraw({ center: [1040, 980], half: 510 }, drawn)).toBeUndefined();
  });

  it('draws again when the view leaves the square drawn', () => {
    const drawn = groundToDraw(need, undefined)!;
    const moved = groundToDraw({ center: [1300, 1000], half: 500 }, drawn);
    expect(moved?.center).toEqual([1300, 1000]);
  });

  it('draws again, sharper, when the camera has come much closer', () => {
    const drawn = groundToDraw(need, undefined)!;
    const close = groundToDraw({ center: [1000, 1000], half: 200 }, drawn);
    expect(close?.half).toBeCloseTo(200 * GROUND.margin);
  });

  it('draws again for what moves on it, but not every frame', () => {
    expect(groundDue({ sinceDrawn: 0.01, poked: false }, 15)).toBe(false);
    expect(groundDue({ sinceDrawn: 0.01, poked: true }, 15)).toBe(true);
    expect(groundDue({ sinceDrawn: 1 / 15 + 0.001, poked: false }, 15)).toBe(true);
  });
});

describe('the resolution of the 3D picture', () => {
  const run = (r: Resolution, ms: number, seconds: number) => {
    for (let t = 0; t < seconds; t += ms / 1000) r.frame(ms);
  };

  it('stays full while frames are quick', () => {
    const r = new Resolution();
    run(r, 16, 5);
    expect(r.scale).toBe(1);
  });

  it('drops while frames are slow, but not below its floor', () => {
    const r = new Resolution();
    run(r, 40, 3);
    expect(r.scale).toBeLessThan(1);
    run(r, 40, 30);
    expect(r.scale).toBeCloseTo(r.lowest);
    const low = new Resolution(0.7);
    run(low, 40, 30);
    expect(low.scale).toBeCloseTo(0.7);
  });

  it('waits out the first seconds, while the view is still loading', () => {
    const r = new Resolution();
    run(r, 80, 1.5);
    expect(r.scale).toBe(1);
  });

  it('shakes off a stutter (quick frames between long stalls) by drawing at another size', () => {
    const r = new Resolution();
    run(r, 16, 4);
    const stutter = () => {
      for (let i = 0; i < 4; i++) r.frame(i === 3 ? 45 : 4);
    };
    for (let i = 0; i < 40 && r.scale === 1; i++) stutter();
    expect(r.scale).toBeLessThan(1);
    const after = r.scale;
    for (let i = 0; i < 40 && r.scale === after; i++) stutter();
    expect(r.scale).not.toBe(after);
  });

  it('gives up on a stutter that no size cures', () => {
    const r = new Resolution();
    run(r, 16, 4);
    let changes = 0;
    for (let i = 0; i < 400; i++) for (let j = 0; j < 4; j++) if (r.frame(j === 3 ? 45 : 4)) changes++;
    expect(changes).toBe(4);
  });

  it('climbs back once frames are quick again', () => {
    const r = new Resolution();
    run(r, 40, 30);
    run(r, 8, 30);
    expect(r.scale).toBe(1);
  });
});

describe('small things far off', () => {
  const grid = 100;
  it('are not drawn', () => {
    expect(tooSmallToSee(50, 5000, grid)).toBe(true);
    expect(tooSmallToSee(50, 1000, grid)).toBe(false);
  });
  it('unless they are big', () => {
    expect(tooSmallToSee(800, 5000, grid)).toBe(false);
  });
  it('on lower quality, sooner', () => {
    expect(tooSmallToSee(100, 4000, grid)).toBe(false);
    expect(tooSmallToSee(100, 4000, grid, 0.03)).toBe(true);
  });
  it('the further, the bigger they must be', () => {
    expect(tooSmallToSee(150, 12000, grid)).toBe(true);
    expect(tooSmallToSee(150, 3000, grid)).toBe(false);
  });
});

describe('the map pieces the 3D view keeps loaded', () => {
  const sizes = { grid: 100, chunkSize: 2000 };

  it('loads a wide square round the camera, whichever way it faces', () => {
    const area = chunkArea([3000, 3000], sizes, undefined)!;
    expect(area.x).toBeLessThanOrEqual(3000 - REACH.squares * 100);
    expect(area.x + area.w).toBeGreaterThanOrEqual(3000 + REACH.squares * 100);
    expect(area.w).toBe(area.h);
  });

  it('keeps the same pieces while the camera moves a little (turning never changes them)', () => {
    const area = chunkArea([3000, 3000], sizes, undefined)!;
    expect(chunkArea([3000, 3000], sizes, area)).toBeUndefined();
    expect(chunkArea([3800, 2500], sizes, area)).toBeUndefined();
    expect(chunkArea([3000 + REACH.squares * 100, 3000], sizes, area)).toBeDefined();
  });

  it('never asks for more pieces than the map may load at once', () => {
    const area = chunkArea([3000, 3000], { grid: 100, chunkSize: 200 }, undefined)!;
    expect(area.w / 200).toBeLessThanOrEqual(22);
  });
});
