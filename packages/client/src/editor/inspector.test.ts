import type { Doc } from '@vtt/core';
import { describe, expect, it } from 'vitest';
import { commonValue, fieldsFor, MIXED } from './inspector.ts';

const wall = (extra: Record<string, unknown> = {}): Doc => ({
  id: 'w',
  type: 'wall',
  rev: 1,
  a: [0, 0],
  b: [1, 0],
  ...extra,
});
const light: Doc = { id: 'l', type: 'light', rev: 1, x: 0, y: 0, bright: 20, dim: 20 };

const field = (docs: Doc[], key: string) => fieldsFor(docs).find((f) => f.key === key)!;

describe('the inspector', () => {
  it('shows the fields of the selection, or none for a mixed bag of types', () => {
    expect(fieldsFor([light]).map((f) => f.key)).toEqual(['bright', 'dim', 'color', 'animation', 'darkness']);
    expect(fieldsFor([light, wall()])).toEqual([]);
    expect(fieldsFor([])).toEqual([]);
  });

  it('shows a value all of them share, or "mixed"', () => {
    const bright = field([light, light], 'bright');
    expect(commonValue([light, light], bright)).toBe(20);
    expect(commonValue([light, { ...light, bright: 10 }], bright)).toBe(MIXED);
  });

  it('turns a wall into a door or window, and back', () => {
    const kind = field([wall()], 'kind');
    expect(commonValue([wall(), wall({ door: 'open' })], kind)).toBe(MIXED);
    expect(commonValue([wall({ sight: false })], kind)).toBe('window');
    expect(kind.patch('door')).toEqual({ door: 'closed', sight: null });
    expect(kind.patch('window')).toEqual({ door: null, sight: false });
    expect(kind.patch('wall')).toEqual({ door: null, sight: null });
  });

  it('offers the door state only when every wall is a door', () => {
    expect(fieldsFor([wall()]).map((f) => f.key)).toEqual(['kind']);
    expect(fieldsFor([wall({ door: 'open' })]).map((f) => f.key)).toEqual(['kind', 'door']);
  });

  it('turns field input into a patch: empty removes, numbers stay numbers, checks set or remove', () => {
    expect(field([light], 'color').patch('')).toEqual({ color: null });
    expect(field([light], 'bright').patch('15')).toEqual({ bright: 15 });
    expect(field([light], 'darkness').patch(true)).toEqual({ darkness: true });
    expect(field([light], 'darkness').patch(false)).toEqual({ darkness: null });
  });

  it('shows rect tile fields for rect tiles and the picture for image tiles', () => {
    const rect: Doc = { id: 't', type: 'tile', rev: 1, kind: 'rect', x: 0, y: 0, w: 1, h: 1, color: '#000' };
    const image: Doc = { id: 'i', type: 'tile', rev: 1, kind: 'image', x: 0, y: 0, w: 1, h: 1, src: 'a.png' };
    expect(fieldsFor([rect]).map((f) => f.key)).toEqual(['x', 'y', 'w', 'h', 'color', 'texture']);
    expect(fieldsFor([image]).map((f) => f.key)).toEqual(['x', 'y', 'w', 'h', 'src']);
    expect(fieldsFor([rect, image]).map((f) => f.key)).toEqual(['x', 'y', 'w', 'h']);
  });

  it('lets the GM hide tokens', () => {
    const token: Doc = { id: 'k', type: 'token', rev: 1, x: 0, y: 0 };
    expect(commonValue([token], field([token], 'hidden'))).toBe(false);
  });
});
