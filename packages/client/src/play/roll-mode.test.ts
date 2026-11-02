import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRollMode, modeNote, ROLL_MODE_OPTIONS, saveRollMode } from './roll-mode.ts';

afterEach(() => vi.unstubAllGlobals());

describe('the saved roll mode', () => {
  it('is kept between visits', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: store.set.bind(store) });
    expect(loadRollMode()).toBe('public');
    saveRollMode('blind');
    expect(loadRollMode()).toBe('blind');
  });

  it('is public when storage is missing, blocked or holds something else', () => {
    expect(loadRollMode()).toBe('public');
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadRollMode()).toBe('public');
    expect(() => saveRollMode('gm')).not.toThrow();
    vi.stubGlobal('localStorage', { getItem: () => 'loud' });
    expect(loadRollMode()).toBe('public');
  });
});

describe('roll mode notes', () => {
  it('say who else sees a message, and nothing for a public one', () => {
    expect(modeNote({})).toBeUndefined();
    expect(modeNote({ mode: 'gm' })).toBe('to GM');
    expect(modeNote({ mode: 'blind' })).toBe('blind');
    expect(modeNote({ mode: 'self' })).toBe('self');
    expect(ROLL_MODE_OPTIONS.map((o) => o.value)).toEqual(['public', 'gm', 'blind', 'self']);
  });
});
