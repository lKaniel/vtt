import { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { Sketch } from './sketch.ts';

// The map previews draw with a Sketch: it draws on Pixi graphics as usual and
// keeps what it drew as shapes, so the 3D view can draw the same in 3D.

describe('a sketch', () => {
  it('keeps a stroked line, a stroked ring and a filled disc', () => {
    const s = new Sketch(new Graphics());
    s.moveTo(0, 0).lineTo(100, 0).lineTo(100, 50).stroke({ width: 6, color: 0xffffff, alpha: 0.8 });
    s.circle(100, 50, 30).stroke({ width: 6, color: 0xff0000 });
    s.circle(10, 10, 5).fill({ color: 0x00ff00 });
    expect(s.shapes).toEqual([
      {
        kind: 'line',
        points: [
          [0, 0],
          [100, 0],
          [100, 50],
        ],
        stroke: { width: 6, color: 0xffffff, alpha: 0.8 },
      },
      { kind: 'circle', at: [100, 50], r: 30, stroke: { width: 6, color: 0xff0000, alpha: 1 } },
      { kind: 'circle', at: [10, 10], r: 5, fill: { color: 0x00ff00, alpha: 1 } },
    ]);
  });

  it('keeps an area filled and stroked as one shape', () => {
    const s = new Sketch(new Graphics());
    s.poly([0, 0, 100, 0, 50, 80]).fill({ color: 0xff9040, alpha: 0.25 }).stroke({ width: 4, color: 0xff9040 });
    expect(s.shapes).toEqual([
      {
        kind: 'poly',
        points: [
          [0, 0],
          [100, 0],
          [50, 80],
        ],
        fill: { color: 0xff9040, alpha: 0.25 },
        stroke: { width: 4, color: 0xff9040, alpha: 1 },
      },
    ]);
  });

  it('forgets everything when cleared, and counts its changes', () => {
    const s = new Sketch(new Graphics());
    const was = s.version;
    s.circle(0, 0, 5).fill({ color: 0 });
    s.clear();
    expect(s.shapes).toEqual([]);
    expect(s.version).toBeGreaterThan(was);
  });
});
