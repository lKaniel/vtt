import { describe, expect, it } from 'vitest';
import { readListPref, readPref, writeListPref, writePref } from './prefs.ts';

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

  it('keeps a list of ids, and an empty one for anything else', () => {
    const store = memory();
    expect(readListPref('closed', store)).toEqual([]);
    writeListPref('closed', ['lore', 'gods'], store);
    expect(readListPref('closed', store)).toEqual(['lore', 'gods']);
    store.setItem('vtt:closed', '{"no":1}');
    expect(readListPref('closed', store)).toEqual([]);
    store.setItem('vtt:closed', 'not json');
    expect(readListPref('closed', store)).toEqual([]);
  });
});
