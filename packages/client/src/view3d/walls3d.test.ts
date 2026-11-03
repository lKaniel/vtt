import type { Wall } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { cutaway, wallBoxes } from './walls3d.ts';

// Walls stand up in 3D: as tall as their own height, else up to the floor's
// ceiling; those between the camera and what it looks at are cut low, as
// in BG3, so the room stays in view.

const GRID = 100;
const wall = (id: string, a: [number, number], b: [number, number], more: Partial<Wall> = {}): Wall => ({
  id,
  a,
  b,
  ...more,
});

describe('walls in 3D', () => {
  const floor = { bottom: 0, top: 10, grid: GRID };

  it('stand as boxes along each wall, to the ceiling or their own height', () => {
    const [plain, low] = wallBoxes(
      [wall('a', [0, 0], [300, 0]), wall('b', [0, 0], [0, 200], { height: { top: 5 } })],
      floor,
    );
    expect(plain).toMatchObject({ mid: [150, 0], length: 300, angle: 0, bottom: 0, height: 200, kind: 'wall' });
    expect(low).toMatchObject({ length: 200, height: 100 });
    expect(low!.angle).toBeCloseTo(Math.PI / 2);
  });

  it('show doors and windows, leave out open doors and walls you see through', () => {
    const boxes = wallBoxes(
      [
        wall('door', [0, 0], [100, 0], { door: 'closed' }),
        wall('open', [0, 0], [100, 0], { door: 'open' }),
        wall('glass', [0, 0], [100, 0], { sight: 'none', light: 'none' }),
        wall('veil', [0, 0], [100, 0], { sight: 'none', light: 'none', sound: 'none' }),
      ],
      floor,
    );
    expect(boxes.map((b) => b.kind)).toEqual(['door', 'window']);
  });

  it('only stand where the viewer has explored', () => {
    const boxes = wallBoxes([wall('a', [0, 0], [100, 0]), wall('b', [500, 0], [600, 0])], {
      ...floor,
      explored: (p) => p[0] < 300,
    });
    expect(boxes.map((b) => b.mid[0])).toEqual([50]);
  });

  it('are cut low between the camera and what it looks at', () => {
    const boxes = wallBoxes([wall('near', [900, 1300], [1100, 1300]), wall('far', [900, 700], [1100, 700])], floor);
    const cut = cutaway(boxes, { target: [1000, 1000], yaw: 0, radius: 800, low: 20 });
    expect(cut.map((b) => b.height)).toEqual([20, 200]);
  });
});
