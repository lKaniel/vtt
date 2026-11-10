import { describe, expect, it } from 'vitest';
import { edgeArrow } from './ping-arrow.ts';

// The screen shows map x 0 to 1000 and y 0 to 500; the arrow keeps 40 map pixels in from its edges.
const VIEW = { x: 0, y: 0, w: 1000, h: 500 };

describe('edgeArrow', () => {
  it('draws nothing for a ping on screen', () => {
    expect(edgeArrow(VIEW, [500, 250], 40)).toBeUndefined();
  });

  it('sits on the edge toward a ping off the right side, pointing at it', () => {
    const arrow = edgeArrow(VIEW, [3000, 250], 40)!;
    expect(arrow.at).toEqual([960, 250]);
    expect(arrow.angle).toBeCloseTo(0);
  });

  it('follows the line from the middle to a ping off a corner', () => {
    const arrow = edgeArrow(VIEW, [500, -2000], 40)!;
    expect(arrow.at[0]).toBeCloseTo(500);
    expect(arrow.at[1]).toBeCloseTo(40);
    expect(arrow.angle).toBeCloseTo(-Math.PI / 2);
    const corner = edgeArrow(VIEW, [-1000, 1000], 40)!;
    expect(corner.at[0]).toBeGreaterThanOrEqual(40);
    expect(corner.at[1]).toBeLessThanOrEqual(460);
    expect(Math.min(corner.at[0] - 40, 460 - corner.at[1])).toBeCloseTo(0);
  });
});
