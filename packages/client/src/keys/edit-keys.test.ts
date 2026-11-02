import { describe, expect, it } from 'vitest';
import { editKey, editorKey } from './edit-keys.ts';

const key = (k: string, mods: { ctrl?: boolean; meta?: boolean; shift?: boolean } = {}) => ({
  key: k,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  shiftKey: !!mods.shift,
});

describe('editKey', () => {
  it('reads the layer keys: group, ungroup, z-order and lock', () => {
    expect(editKey(key('g', { ctrl: true }))).toBe('group');
    expect(editKey(key('G', { ctrl: true, shift: true }))).toBe('ungroup');
    expect(editKey(key(']', { ctrl: true }))).toBe('forward');
    expect(editKey(key('[', { ctrl: true }))).toBe('backward');
    expect(editKey(key('}', { ctrl: true, shift: true }))).toBe('front');
    expect(editKey(key('{', { ctrl: true, shift: true }))).toBe('back');
    expect(editKey(key(']', { ctrl: true, shift: true }))).toBe('front');
    expect(editKey(key('L', { ctrl: true, shift: true }))).toBe('lock');
    expect(editKey(key('l', { ctrl: true }))).toBeUndefined();
  });

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

describe('select all', () => {
  it('is Ctrl+A', () => {
    expect(editKey(key('a', { ctrl: true }))).toBe('selectAll');
  });
});

describe('editorKey', () => {
  it('switches modes: T tokens, Shift+T tiles, W walls, L lights', () => {
    expect(editorKey(key('t'), false)).toEqual({ mode: 'tokens' });
    expect(editorKey(key('T', { shift: true }), false)).toEqual({ mode: 'tiles' });
    expect(editorKey(key('w'), false)).toEqual({ mode: 'walls' });
    expect(editorKey(key('l'), true)).toEqual({ mode: 'lights' });
    expect(editorKey(key('w', { ctrl: true }), false)).toBeUndefined();
  });

  it('switches to drawings with D, notes with N and templates with M', () => {
    expect(editorKey(key('d'), false)).toEqual({ mode: 'drawings' });
    expect(editorKey(key('n'), false)).toEqual({ mode: 'notes' });
    expect(editorKey(key('m'), false)).toEqual({ mode: 'templates' });
  });

  it('picks up the ruler with R', () => {
    expect(editorKey(key('r'), false)).toEqual({ mode: 'templates', tool: 'ruler' });
    expect(editorKey(key('R', { shift: true }), true)).toEqual({ mode: 'templates', tool: 'ruler' });
  });

  it('nudges with the arrows outside the tokens mode (where they walk)', () => {
    expect(editorKey(key('ArrowLeft'), true)).toEqual({ nudge: [-1, 0], big: false });
    expect(editorKey(key('ArrowDown', { shift: true }), true)).toEqual({ nudge: [0, 1], big: true });
    expect(editorKey(key('ArrowDown'), false)).toBeUndefined();
  });
});
