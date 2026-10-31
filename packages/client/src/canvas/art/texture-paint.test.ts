import { describe, expect, it } from 'vitest';
import { periodicNoise, paintTexture, TEXTURES } from './texture-paint.ts';

describe('periodicNoise', () => {
  it('stays between 0 and 1 and wraps around its period', () => {
    for (const [x, y] of [
      [0.3, 0.7],
      [5.5, 2.25],
      [7.9, 0.1],
    ] as const) {
      const v = periodicNoise(x, y, 8, 1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(periodicNoise(x + 8, y, 8, 1)).toBeCloseTo(v);
      expect(periodicNoise(x, y + 8, 8, 1)).toBeCloseTo(v);
    }
  });
});

describe('paintTexture', () => {
  it('paints every kind as light, varied, opaque pixels that tile seamlessly', () => {
    const size = 128;
    for (const kind of TEXTURES) {
      const px = paintTexture(kind, size);
      expect(px).toHaveLength(size * size * 4);
      const lum = (i: number) => px[i * 4]!;
      const values = Array.from({ length: size * size }, (_, i) => lum(i));
      expect(Math.max(...values), kind).toBeGreaterThan(200);
      expect(Math.max(...values) - Math.min(...values), kind).toBeGreaterThan(20);
      expect(px.every((v, i) => i % 4 !== 3 || v === 255)).toBe(true);
      // The left and right edges, and top and bottom, are close: no seam when repeated.
      let seam = 0;
      for (let y = 0; y < size; y++) seam += Math.abs(lum(y * size) - lum(y * size + size - 1));
      expect(seam / size, kind).toBeLessThan(40);
    }
  });

  it('is the same every time', () => {
    expect(paintTexture('stone', 16)).toEqual(paintTexture('stone', 16));
  });
});
