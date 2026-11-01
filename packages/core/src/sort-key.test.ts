import { describe, expect, it } from 'vitest';
import { keyBetween, keysBetween } from './sort-key.ts';

/** Sort keys compare by character code, not by locale. */
const sorted = (keys: string[]): string[] => [...keys].sort((a, b) => (a < b ? -1 : 1));

describe('keyBetween', () => {
  it('gives a first key when the list is empty', () => {
    expect(keyBetween(null, null)).toBe('V');
  });

  it('puts a key after the last one', () => {
    expect(keyBetween('V', null) > 'V').toBe(true);
  });

  it('puts a key before the first one', () => {
    const key = keyBetween(null, 'V');
    expect(key < 'V').toBe(true);
  });

  it('puts a key between two neighbours, however close they are', () => {
    let lo = 'a';
    const hi = 'b';
    for (let i = 0; i < 50; i++) {
      const mid = keyBetween(lo, hi);
      expect(mid > lo && mid < hi).toBe(true);
      lo = mid;
    }
  });

  it('keeps appended keys short and in order', () => {
    let last: string | null = null;
    const keys: string[] = [];
    for (let i = 0; i < 200; i++) {
      last = keyBetween(last, null);
      keys.push(last);
    }
    expect(sorted(keys)).toEqual(keys);
    expect(last!.length).toBeLessThan(10);
  });

  it('refuses keys out of order', () => {
    expect(() => keyBetween('b', 'a')).toThrow();
    expect(() => keyBetween('a', 'a')).toThrow();
  });
});

describe('keysBetween', () => {
  it('makes n ordered keys between two neighbours', () => {
    const keys = keysBetween('a', 'b', 5);
    expect(keys).toHaveLength(5);
    expect(sorted(keys)).toEqual(keys);
    expect(keys.every((k) => k > 'a' && k < 'b')).toBe(true);
  });

  it('makes keys for a fresh list', () => {
    const keys = keysBetween(null, null, 3);
    expect(new Set(keys).size).toBe(3);
    expect(sorted(keys)).toEqual(keys);
  });
});
