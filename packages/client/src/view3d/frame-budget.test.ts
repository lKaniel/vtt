import { describe, expect, it } from 'vitest';
import { GROUND, groundToDraw, groundDue, Resolution, tooSmallToSee } from './frame-budget.ts';

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
    expect(groundDue({ sinceDrawn: 0.01, poked: false })).toBe(false);
    expect(groundDue({ sinceDrawn: 0.01, poked: true })).toBe(true);
    expect(groundDue({ sinceDrawn: GROUND.refresh + 0.001, poked: false })).toBe(true);
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
    run(r, 40, 2);
    expect(r.scale).toBeLessThan(1);
    run(r, 40, 30);
    expect(r.scale).toBeCloseTo(Resolution.lowest);
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
  it('the further, the bigger they must be', () => {
    expect(tooSmallToSee(150, 12000, grid)).toBe(true);
    expect(tooSmallToSee(150, 3000, grid)).toBe(false);
  });
});
