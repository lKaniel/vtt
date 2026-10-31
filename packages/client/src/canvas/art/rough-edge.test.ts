import { describe, expect, it } from 'vitest';
import { roughOutline } from './rough-edge.ts';

const pairs = (poly: number[]) => poly.flatMap((v, i) => (i % 2 ? [] : [[v, poly[i + 1]!] as const]));

describe('roughOutline', () => {
  const rect = { x: 0, y: 900, w: 2000, h: 200 };

  it('wobbles the edges a little around the rectangle', () => {
    const pts = pairs(roughOutline(rect, 2000));
    expect(pts.length).toBeGreaterThan(40);
    const top = pts.filter(([x, y]) => y < 1000 && x > 0 && x < 2000);
    expect(Math.min(...top.map(([, y]) => y))).toBeGreaterThan(880);
    expect(Math.max(...top.map(([, y]) => y))).toBeLessThan(920);
    expect(new Set(top.map(([, y]) => Math.round(y))).size).toBeGreaterThan(5);
  });

  it('keeps edges that lie on chunk borders straight, so chunks join without gaps', () => {
    const pts = pairs(roughOutline(rect, 2000));
    const ends = pts.filter(([x]) => x <= 0 || x >= 2000);
    expect(ends.every(([x]) => x === 0 || x === 2000)).toBe(true);
  });

  it('wobbles the same way wherever the same line is drawn', () => {
    const left = pairs(roughOutline({ x: 0, y: 900, w: 2000, h: 200 }, 2000)).filter(
      ([x, y]) => y < 1000 && x === 1000,
    );
    const right = pairs(roughOutline({ x: 1000, y: 900, w: 1000, h: 300 }, 2000)).filter(
      ([x, y]) => y < 1000 && x === 1000,
    );
    expect(left[0]?.[1]).toBeCloseTo(right[0]![1]);
  });
});
