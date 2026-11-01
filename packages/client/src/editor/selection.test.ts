import { describe, expect, it } from 'vitest';
import { clickSelect, keyOf, marqueeSelect, refOf } from './selection.ts';

const none = { shift: false, ctrl: false, alt: false };
const shift = { ...none, shift: true };
const ctrl = { ...none, ctrl: true };

describe('selection keys', () => {
  it('round-trip a document reference', () => {
    expect(keyOf({ coll: 'crossroads/walls', id: 'w-1' })).toBe('crossroads/walls#w-1');
    expect(refOf('crossroads/walls#w-1')).toEqual({ coll: 'crossroads/walls', id: 'w-1' });
  });
});

describe('clickSelect', () => {
  it('a click selects just what is under the pointer; empty space deselects', () => {
    expect(clickSelect(['a', 'b'], 'c', none)).toEqual(['c']);
    expect(clickSelect(['a', 'b'], 'a', none)).toEqual(['a']);
    expect(clickSelect(['a', 'b'], undefined, none)).toEqual([]);
  });

  it('shift adds or takes away, ctrl takes away, and neither lets go on empty space', () => {
    expect(clickSelect(['a'], 'b', shift)).toEqual(['a', 'b']);
    expect(clickSelect(['a', 'b'], 'a', shift)).toEqual(['b']);
    expect(clickSelect(['a', 'b'], 'b', ctrl)).toEqual(['a']);
    expect(clickSelect(['a'], undefined, shift)).toEqual(['a']);
  });
});

describe('marqueeSelect', () => {
  it('replaces, adds with shift, takes away with ctrl', () => {
    expect(marqueeSelect(['a'], ['b', 'c'], none)).toEqual(['b', 'c']);
    expect(marqueeSelect(['a', 'b'], ['b', 'c'], shift)).toEqual(['a', 'b', 'c']);
    expect(marqueeSelect(['a', 'b'], ['b', 'c'], ctrl)).toEqual(['a']);
  });
});
