import { describe, expect, it } from 'vitest';
import { editKey } from './edit-keys.ts';

const key = (k: string, mods: { ctrl?: boolean; meta?: boolean; shift?: boolean } = {}) => ({
  key: k,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  shiftKey: !!mods.shift,
});

describe('editKey', () => {
  it('reads undo and redo, with Ctrl or Cmd', () => {
    expect(editKey(key('z', { ctrl: true }))).toBe('undo');
    expect(editKey(key('z', { meta: true }))).toBe('undo');
    expect(editKey(key('Z', { ctrl: true, shift: true }))).toBe('redo');
    expect(editKey(key('y', { ctrl: true }))).toBe('redo');
  });

  it('reads duplicate and delete', () => {
    expect(editKey(key('d', { ctrl: true }))).toBe('duplicate');
    expect(editKey(key('Delete'))).toBe('delete');
    expect(editKey(key('Backspace'))).toBe('delete');
  });

  it('leaves copy, cut and paste to the clipboard events, and plain letters alone', () => {
    expect(editKey(key('c', { ctrl: true }))).toBe('clipboard');
    expect(editKey(key('x', { ctrl: true }))).toBe('clipboard');
    expect(editKey(key('v', { ctrl: true, shift: true }))).toBe('clipboard');
    expect(editKey(key('z'))).toBeUndefined();
    expect(editKey(key('c'))).toBeUndefined();
  });
});
