import { describe, expect, it } from 'vitest';
import {
  actionLabel,
  actionOf,
  comboOf,
  conflicts,
  keyLabel,
  KEY_ACTIONS,
  keyOf,
  loadKeymap,
  saveKeymap,
} from './keybinds.ts';

const press = (key: string, shift = false) => ({ key, shiftKey: shift, ctrlKey: false, metaKey: false, altKey: false });

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
  };
};

describe('key bindings', () => {
  it('name a key press the same way the screen shows it', () => {
    expect(comboOf(press('C', true))).toBe('shift+c');
    expect(comboOf(press(' '))).toBe('space');
    expect(comboOf(press('ArrowUp'))).toBe('arrowup');
    expect(keyLabel('shift+t')).toBe('Shift+T');
    expect(keyLabel('space')).toBe('Space');
    expect(keyLabel('arrowup')).toBe('↑');
  });

  it('find the action of a press by the defaults, Shift falling back to the bare key', () => {
    expect(actionOf(press('c'), {})).toBe('sheet');
    expect(actionOf(press('T', true), {})).toBe('mode-tiles');
    expect(actionOf(press('R', true), {})).toBe('mode-ruler');
    expect(actionOf(press('3'), {})).toBe('hotbar-3');
    expect(actionOf(press('q'), {})).toBeUndefined();
  });

  it('follow the player’s own keys, and drop the default they replaced', () => {
    const map = { sheet: 'i' };
    expect(actionOf(press('i'), map)).toBe('sheet');
    expect(actionOf(press('c'), map)).toBeUndefined();
    expect(keyOf('sheet', map)).toBe('i');
    expect(keyOf('endTurn', map)).toBe('space');
  });

  it('only look among the actions asked for', () => {
    expect(actionOf(press('t'), {}, ['target'])).toBe('target');
    expect(actionOf(press('t'), {}, ['mode-tokens'])).toBe('mode-tokens');
  });

  it('say which keys do two things', () => {
    expect(conflicts({ sheet: 'w' })).toEqual(new Map([['w', ['sheet', 'mode-walls', 'cam-forward']]]));
    expect(conflicts({}).size).toBe(0); // T targets in the tokens mode and switches to it elsewhere, on purpose
  });

  it('keep the player’s keys in this browser', () => {
    const store = memory();
    saveKeymap({ sheet: 'i' }, store);
    expect(loadKeymap(store)).toEqual({ sheet: 'i' });
    store.setItem('vtt:keys', 'not json');
    expect(loadKeymap(store)).toEqual({});
    expect(KEY_ACTIONS.every((a) => a.key && !actionLabel(a).startsWith('keys.'))).toBe(true);
    expect(actionLabel(KEY_ACTIONS.find((a) => a.id === 'hotbar-0')!)).toBe('Slot 10');
    expect(actionLabel(KEY_ACTIONS.find((a) => a.id === 'sheet')!)).toBe('Open or close the sheet');
  });
});
