import { describe, expect, it } from 'vitest';
import { burntOut, stampLight } from './light-time.ts';

describe('lights that burn for a while', () => {
  it('gives a light that lasts its end time once, counted from now', () => {
    const torch = { bright: 20, dim: 20, lasts: 3600 };
    const lit = stampLight(torch, 100);
    expect(lit).toEqual({ ...torch, endsAt: 3700 });
    expect(stampLight(lit, 5000)).toBe(lit);
  });

  it('leaves lights that burn forever alone', () => {
    const lamp = { bright: 10, dim: 0 };
    expect(stampLight(lamp, 100)).toBe(lamp);
    expect(burntOut(lamp, 1e12)).toBe(false);
  });

  it('is out once its time is up', () => {
    expect(burntOut({ bright: 1, dim: 0, endsAt: 50 }, 49)).toBe(false);
    expect(burntOut({ bright: 1, dim: 0, endsAt: 50 }, 50)).toBe(true);
  });
});
