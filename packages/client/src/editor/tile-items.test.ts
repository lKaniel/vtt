import type { Doc } from '@vtt/core';
import { describe, expect, it } from 'vitest';
import { TileItems } from './tile-items.ts';

const rect = (id: string, x: number, y: number, extra: Partial<Doc> = {}): Doc => ({
  id,
  type: 'tile',
  rev: 1,
  kind: 'rect',
  x,
  y,
  w: 100,
  h: 100,
  ...extra,
});
const tiles: Doc[] = [
  rect('ground', 0, 0, { w: 1000, h: 1000, background: true }),
  { id: 'camp', type: 'tile', rev: 1, kind: 'group' },
  rect('tent', 100, 100, { parent: 'camp' }),
  rect('fire', 300, 100, { parent: 'camp' }),
  rect('statue', 600, 600, { locked: true }),
];
const items = (scope?: string) => new TileItems(tiles, 's/tiles', scope);
const k = (id: string) => `s/tiles#${id}`;

describe('TileItems', () => {
  it('a click on a tile in a group picks the group; locked tiles let clicks through', () => {
    const it = items();
    expect(it.pick.map((h) => h.key)).toEqual([k('ground'), k('camp'), k('camp')]);
  });

  it('inside a group, clicks pick its children', () => {
    expect(items('camp').pick.map((h) => h.key)).toEqual([k('ground'), k('tent'), k('fire')]);
  });

  it('a marquee takes groups by their bounds, ground only when it holds it whole', () => {
    expect(
      items()
        .units('touch')
        .map((h) => h.key),
    ).toEqual([k('camp')]);
    expect(
      items()
        .units('contain')
        .map((h) => h.key),
    ).toEqual([k('ground'), k('camp')]);
    expect(items().units('touch')[0]!.shape).toEqual({ kind: 'rect', x: 100, y: 100, w: 300, h: 100 });
  });

  it('ground moves only once it is selected', () => {
    expect(items().draggable(k('ground'))).toBe(false);
    expect(items().draggable(k('camp'))).toBe(true);
  });

  it('a double click on a group selects the child under the pointer', () => {
    expect(items().enter(k('camp'), [350, 150])).toBe(k('fire'));
    expect(items().enter(k('ground'), [50, 50])).toBeUndefined();
    expect(items().enter(k('camp'), [50, 50])).toBeUndefined();
  });

  it('the scope is the parent of what is selected', () => {
    expect(TileItems.scopeOf(tiles, ['tent'])).toBe('camp');
    expect(TileItems.scopeOf(tiles, ['camp'])).toBeUndefined();
  });
});
