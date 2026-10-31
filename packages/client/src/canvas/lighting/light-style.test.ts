import { describe, expect, it } from 'vitest';
import { ambientColor, falloff, lightColor, lightPulse, parseColor } from './light-style.ts';

describe('parseColor', () => {
  it('reads #rgb and #rrggbb, and falls back for anything else', () => {
    expect(parseColor('#ff8000', 1)).toBe(0xff8000);
    expect(parseColor('#f80', 1)).toBe(0xff8800);
    expect(parseColor('torch', 7)).toBe(7);
    expect(parseColor(undefined, 7)).toBe(7);
  });
});

describe('lightColor', () => {
  it('uses the light’s colour, or a warm white', () => {
    expect(lightColor({ color: '#3060ff' })).toBe(0x3060ff);
    expect(lightColor({})).toBe(0xfff0d8);
  });
});

describe('ambientColor', () => {
  it('is white by day and a dim moonlit blue at night', () => {
    expect(ambientColor(0)).toBe(0xffffff);
    const night = ambientColor(0.85);
    const [r, g, b] = [(night >> 16) & 255, (night >> 8) & 255, night & 255];
    expect(b).toBeGreaterThan(r);
    expect(Math.max(r, g, b)).toBeLessThan(0x50);
  });
});

describe('falloff', () => {
  it('is full in bright light, softens past its edge and fades out across the dim ring', () => {
    expect(falloff(0, 0.5)).toBe(1);
    expect(falloff(0.25, 0.5)).toBeCloseTo(1);
    expect(falloff(0.5, 0.5)).toBeGreaterThan(0.5);
    expect(falloff(0.5, 0.5)).toBeLessThan(0.85);
    expect(falloff(0.75, 0.5)).toBeGreaterThan(0.1);
    expect(falloff(0.75, 0.5)).toBeLessThan(0.5);
    expect(falloff(1, 0.5)).toBe(0);
  });

  it('fades smoothly from the centre when there is no bright light', () => {
    expect(falloff(0, 0)).toBeCloseTo(0.5);
    expect(falloff(1, 0)).toBe(0);
  });
});

describe('lightPulse', () => {
  it('is steady without an animation', () => {
    expect(lightPulse(undefined, 1234, 1)).toBe(1);
  });

  it('flickers and pulses a little around full strength', () => {
    for (const anim of ['flicker', 'pulse'] as const) {
      const values = [0, 100, 200, 300, 400, 500, 900, 1700].map((t) => lightPulse(anim, t, 3));
      expect(Math.min(...values)).toBeGreaterThan(0.75);
      expect(Math.max(...values)).toBeLessThan(1.15);
      expect(new Set(values.map((v) => v.toFixed(3))).size).toBeGreaterThan(3);
    }
  });
});
