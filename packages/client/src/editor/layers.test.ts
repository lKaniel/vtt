import type { Doc } from '@vtt/core';
import { describe, expect, it } from 'vitest';
import { dropPlace, layerRows } from './layers.ts';

const t = (id: string, extra: Partial<Doc> = {}): Doc => ({ id, type: 'tile', rev: 1, kind: 'rect', ...extra });
const tiles = [
  t('ground', { sort: 'A', background: true }),
  t('house', { sort: 'B', name: 'The house' }),
  t('bed', { parent: 'house', sort: 'V' }),
  t('chest', { parent: 'house', sort: 'W' }),
  { ...t('camp', { sort: 'C' }), kind: 'group' },
  t('tent', { parent: 'camp' }),
];

describe('layerRows', () => {
  it('lists the topmost first, children under their parent', () => {
    expect(layerRows(tiles, new Set()).map((r) => [r.id, r.depth])).toEqual([
      ['camp', 0],
      ['tent', 1],
      ['house', 0],
      ['chest', 1],
      ['bed', 1],
      ['ground', 0],
    ]);
  });

  it('names rows and hides what is in a folded group', () => {
    const rows = layerRows(tiles, new Set(['house']));
    expect(rows.find((r) => r.id === 'house')).toMatchObject({ label: 'The house', open: false, parent: true });
    expect(rows.map((r) => r.id)).not.toContain('bed');
  });
});

describe('dropPlace', () => {
  it('above a row puts tiles over it, below puts them under it', () => {
    expect(dropPlace(tiles, ['tent'], 'chest', 'above')).toEqual({ parent: 'house', index: 2 });
    expect(dropPlace(tiles, ['tent'], 'chest', 'below')).toEqual({ parent: 'house', index: 1 });
    expect(dropPlace(tiles, ['bed'], 'chest', 'above')).toEqual({ parent: 'house', index: 1 });
  });

  it('inside a group or container puts them on top of what is in it', () => {
    expect(dropPlace(tiles, ['tent'], 'house', 'inside')).toEqual({ parent: 'house', index: 2 });
  });

  it('ground takes nothing inside it, and nothing goes into itself', () => {
    expect(dropPlace(tiles, ['tent'], 'ground', 'inside')).toEqual({ parent: undefined, index: 1 });
    expect(dropPlace(tiles, ['house'], 'bed', 'above')).toBeUndefined();
  });
});
