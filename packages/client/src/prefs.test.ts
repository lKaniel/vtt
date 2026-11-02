import { describe, expect, it } from 'vitest';
import { readPref, writePref } from './prefs.ts';

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
  };
};

describe('options kept in this browser', () => {
  it('reads back what was written, and the fallback for anything unknown', () => {
    const store = memory();
    expect(readPref('motion', ['full', 'off'], 'full', store)).toBe('full');
    writePref('motion', 'off', store);
    expect(readPref('motion', ['full', 'off'], 'full', store)).toBe('off');
    writePref('motion', 'wild', store);
    expect(readPref('motion', ['full', 'off'], 'full', store)).toBe('full');
  });

  it('falls back when the browser refuses storage', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => writePref('motion', 'off', broken)).not.toThrow();
    expect(readPref('motion', ['full', 'off'], 'full', broken)).toBe('full');
  });
});
