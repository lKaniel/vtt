import type { Doc } from '@vtt/core';
import { describe, expect, it } from 'vitest';
import {
  applyTileEdit,
  containerAt,
  groupEdit,
  isTileLocked,
  moveIntoEdit,
  nestEdit,
  pickUnit,
  reorderEdit,
  scaleGroupEdit,
  tileBounds,
  tileOrder,
  ungroupEdit,
  withDescendants,
  withGroupBounds,
} from './tiles.ts';

const rect = (id: string, [x, y, w, h]: [number, number, number, number], extra: Partial<Doc> = {}): Doc => ({
  id,
  type: 'tile',
  rev: 1,
  kind: 'rect',
  color: '#888888',
  x,
  y,
  w,
  h,
  ...extra,
});
const group = (id: string, extra: Partial<Doc> = {}): Doc => ({ id, type: 'tile', rev: 1, kind: 'group', ...extra });
const ids = (docs: readonly Doc[]) => docs.map((d) => d.id);

describe('tileOrder', () => {
  it('keeps file order for tiles without sort keys, and puts keyed ones after', () => {
    const tiles = [rect('b', [0, 0, 1, 1]), rect('k', [0, 0, 1, 1], { sort: 'V' }), rect('a', [0, 0, 1, 1])];
    expect(ids(tileOrder(tiles))).toEqual(['b', 'a', 'k']);
  });

  it('draws children right after their parent, depth first', () => {
    const tiles = [
      rect('house', [0, 0, 500, 500], { sort: 'V' }),
      rect('ground', [0, 0, 2000, 2000], { sort: 'B' }),
      rect('table', [100, 100, 100, 100], { parent: 'house', sort: 'X' }),
      rect('rug', [50, 50, 300, 300], { parent: 'house', sort: 'W' }),
      rect('tree', [900, 900, 100, 100], { sort: 'Z' }),
    ];
    expect(ids(tileOrder(tiles))).toEqual(['ground', 'house', 'rug', 'table', 'tree']);
  });

  it('keeps tiles whose parent is missing at the top level', () => {
    expect(ids(tileOrder([rect('a', [0, 0, 1, 1], { parent: 'gone' })]))).toEqual(['a']);
  });
});

describe('bounds, locks and picking', () => {
  const tiles = [
    group('g'),
    rect('a', [0, 0, 100, 100], { parent: 'g' }),
    group('inner', { parent: 'g' }),
    rect('b', [300, 200, 100, 50], { parent: 'inner' }),
    rect('c', [1000, 1000, 10, 10], { locked: true }),
  ];

  it('a group spans its children; a tile is its own rect', () => {
    expect(tileBounds(tiles, 'g')).toEqual({ x: 0, y: 0, w: 400, h: 250 });
    expect(tileBounds(tiles, 'a')).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(tileBounds([group('empty')], 'empty')).toBeUndefined();
  });

  it('gives groups their bounds as fields, for drawing and picking', () => {
    const shown = withGroupBounds(tiles);
    expect(shown.find((d) => d.id === 'inner')).toMatchObject({ x: 300, y: 200, w: 100, h: 50 });
  });

  it('a click picks the outermost group, or the child of the group you are in', () => {
    expect(pickUnit(tiles, 'b', undefined)).toBe('g');
    expect(pickUnit(tiles, 'b', 'g')).toBe('inner');
    expect(pickUnit(tiles, 'b', 'inner')).toBe('b');
    expect(pickUnit(tiles, 'c', 'g')).toBe('c');
  });

  it('a locked parent locks what is in it', () => {
    const locked = [group('g', { locked: true }), rect('a', [0, 0, 1, 1], { parent: 'g' })];
    expect(isTileLocked(locked, 'a')).toBe(true);
    expect(isTileLocked(tiles, 'a')).toBe(false);
  });

  it('moving a group takes everything in it', () => {
    expect(withDescendants(tiles, ['g', 'a']).toSorted((a, b) => a.localeCompare(b))).toEqual(['a', 'b', 'g', 'inner']);
  });
});

describe('containers', () => {
  const tiles = [
    rect('ground', [0, 0, 2000, 2000], { background: true }),
    rect('house', [100, 100, 500, 500]),
    rect('room', [150, 150, 200, 200], { parent: 'house' }),
    group('g'),
    rect('crate', [1200, 1200, 100, 100], { parent: 'g' }),
  ];

  it('is the topmost tile under the point that is not ground, a group or excluded', () => {
    expect(containerAt(tiles, [200, 200], new Set())).toBe('room');
    expect(containerAt(tiles, [500, 500], new Set())).toBe('house');
    expect(containerAt(tiles, [1250, 1250], new Set())).toBe('crate');
    expect(containerAt(tiles, [1500, 1500], new Set())).toBeUndefined();
    expect(containerAt(tiles, [200, 200], new Set(['house']))).toBeUndefined();
  });

  it('a tile moved onto another goes inside it, on top', () => {
    const moved = [...tiles, rect('chair', [400, 400, 50, 50])];
    const edit = nestEdit(moved, ['chair']);
    expect(edit.updates).toEqual([{ id: 'chair', patch: { parent: 'house', sort: expect.any(String) as string } }]);
    const after = applyTileEdit(moved, edit);
    expect(ids(tileOrder(after)).at(-3)).toBe('chair');
  });

  it('a tile moved off its container leaves it; one in a group stays in the group', () => {
    const out = tiles.map((t) => (t.id === 'room' ? { ...t, x: 1500, y: 100 } : t));
    expect(nestEdit(out, ['room']).updates).toEqual([
      { id: 'room', patch: { parent: null, sort: expect.any(String) as string } },
    ]);
    const far = tiles.map((t) => (t.id === 'crate' ? { ...t, x: 1700, y: 1700 } : t));
    expect(nestEdit(far, ['crate']).updates).toEqual([]);
  });

  it('a tile staying in its container changes nothing', () => {
    expect(nestEdit(tiles, ['room']).updates).toEqual([]);
  });
});

describe('grouping', () => {
  const tiles = [
    rect('a', [0, 0, 10, 10], { sort: 'A' }),
    rect('b', [0, 0, 10, 10], { sort: 'B' }),
    rect('c', [0, 0, 10, 10], { sort: 'C' }),
    rect('d', [0, 0, 10, 10], { sort: 'D' }),
  ];

  it('puts the selection in a new group where the topmost of them was', () => {
    const edit = groupEdit(tiles, ['c', 'a'], 'group');
    expect(edit.creates).toEqual([expect.objectContaining({ id: 'group', type: 'tile', kind: 'group' })]);
    const after = applyTileEdit(tiles, edit);
    expect(ids(tileOrder(after))).toEqual(['b', 'group', 'a', 'c', 'd']);
    expect(after.filter((t) => t.parent === 'group').map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('ungrouping puts the children back where the group was, and deletes it', () => {
    const grouped = applyTileEdit(tiles, groupEdit(tiles, ['c', 'a'], 'group'));
    const edit = ungroupEdit(grouped, ['group']);
    expect(edit.deletes).toEqual(['group']);
    const after = applyTileEdit(grouped, edit);
    expect(ids(tileOrder(after))).toEqual(['b', 'a', 'c', 'd']);
    expect(after.every((t) => t.parent === undefined)).toBe(true);
  });

  it('groups tiles that never had sort keys, keeping their order', () => {
    const plain = [rect('x', [0, 0, 1, 1]), rect('y', [0, 0, 1, 1]), rect('z', [0, 0, 1, 1])];
    const after = applyTileEdit(plain, groupEdit(plain, ['x', 'z'], 'g'));
    expect(ids(tileOrder(after))).toEqual(['y', 'g', 'x', 'z']);
  });

  it('ungrouping something that is not a group does nothing', () => {
    expect(ungroupEdit(tiles, ['a'])).toEqual({ creates: [], updates: [], deletes: [] });
  });
});

describe('z-order', () => {
  const tiles = [rect('a', [0, 0, 1, 1]), rect('b', [0, 0, 1, 1]), rect('c', [0, 0, 1, 1]), rect('d', [0, 0, 1, 1])];
  const order = (how: Parameters<typeof reorderEdit>[2], sel: string[]) =>
    ids(tileOrder(applyTileEdit(tiles, reorderEdit(tiles, sel, how))));

  it('brings forward and sends backward one step', () => {
    expect(order('forward', ['b'])).toEqual(['a', 'c', 'b', 'd']);
    expect(order('backward', ['c'])).toEqual(['a', 'c', 'b', 'd']);
    expect(order('forward', ['d'])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('brings to the front and sends to the back, keeping the selection in order', () => {
    expect(order('front', ['a', 'c'])).toEqual(['b', 'd', 'a', 'c']);
    expect(order('back', ['d', 'b'])).toEqual(['b', 'd', 'a', 'c']);
  });

  it('only moves among siblings', () => {
    const nested = [...tiles, rect('kid', [0, 0, 1, 1], { parent: 'a' })];
    const after = applyTileEdit(nested, reorderEdit(nested, ['kid'], 'front'));
    expect(after.find((t) => t.id === 'kid')?.parent).toBe('a');
  });

  it('changes no more keys than it needs once keys exist', () => {
    const keyed = applyTileEdit(tiles, reorderEdit(tiles, ['a'], 'front'));
    expect(reorderEdit(keyed, ['b'], 'front').updates.map((u) => u.id)).toEqual(['b']);
  });
});

describe('moving in the layers panel', () => {
  const tiles = [
    group('g', { sort: 'B' }),
    rect('a', [0, 0, 1, 1], { parent: 'g', sort: 'V' }),
    rect('b', [0, 0, 1, 1]),
  ];

  it('drops tiles into a parent at a place among its children', () => {
    const after = applyTileEdit(tiles, moveIntoEdit(tiles, ['b'], 'g', 0));
    expect(ids(tileOrder(after))).toEqual(['g', 'b', 'a']);
  });

  it('deletes a group left empty', () => {
    const edit = moveIntoEdit(tiles, ['a'], undefined, 2);
    expect(edit.deletes).toEqual(['g']);
  });

  it('never puts a group inside itself', () => {
    expect(moveIntoEdit(tiles, ['g'], 'a', 0)).toEqual({ creates: [], updates: [], deletes: [] });
  });
});

describe('resizing a group', () => {
  it('scales what is in it to the new bounds', () => {
    const tiles = [
      group('g'),
      rect('a', [0, 0, 100, 100], { parent: 'g' }),
      rect('b', [100, 100, 100, 100], { parent: 'g' }),
    ];
    const edit = scaleGroupEdit(tiles, 'g', { x: 0, y: 0, w: 400, h: 200 });
    expect(edit.updates).toEqual([
      { id: 'a', patch: { x: 0, y: 0, w: 200, h: 100 } },
      { id: 'b', patch: { x: 200, y: 100, w: 200, h: 100 } },
    ]);
  });
});
