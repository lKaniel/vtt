import { describe, expect, it } from 'vitest';
import type { Chunk } from './schema.ts';
import { floorsHome, floorsOnWhole, partFloors } from './part-floors.ts';
import { docIntoWhole, intoPart, intoWhole } from './scene-parts.ts';

const whole = [
  { id: 'ground', name: 'Ground', bottom: 0, top: 10 },
  { id: 'upper', name: 'Upper floor', bottom: 10, top: 20 },
  { id: 'roof', name: 'Roof', bottom: 20 },
];

describe('part floors', () => {
  it('needs no map when the part uses the whole scene’s ids', () => {
    expect(partFloors([{ id: 'ground', name: 'Ground', bottom: 0 }], whole)).toBeUndefined();
    expect(partFloors(undefined, whole)).toBeUndefined();
    expect(partFloors([{ id: 'a', name: 'A', bottom: 0 }], undefined)).toBeUndefined();
  });

  it('maps a floor by its name first, then by where it starts', () => {
    const part = [
      { id: 'f0', name: 'ground', bottom: 0 },
      { id: 'f1', name: 'First', bottom: 12 },
      { id: 'attic', name: 'Attic', bottom: 30 },
      { id: 'cellar', name: 'Cellar', bottom: -10 },
    ];
    expect(partFloors(part, whole)).toEqual({ f0: 'ground', f1: 'upper', attic: 'roof', cellar: 'ground' });
  });

  it('renames an item’s floors on the whole and back', () => {
    const floors = { f0: 'ground', f1: 'upper' };
    expect(floorsOnWhole({ id: 't', level: 'f1' }, floors)).toEqual({ id: 't', level: 'upper' });
    expect(floorsOnWhole({ id: 't', levels: ['f0', 'f1', 'ground'] }, floors)).toEqual({
      id: 't',
      levels: ['ground', 'upper'],
    });
    expect(floorsHome({ id: 't', level: 'upper', levels: ['ground', 'upper'] }, floors)).toEqual({
      id: 't',
      level: 'f1',
      levels: ['f0', 'f1'],
    });
    expect(floorsOnWhole({ id: 't' }, floors)).toEqual({ id: 't' });
  });

  it('lays a part’s tiles and regions on the whole scene’s floors', () => {
    const part = { scene: 'market', x: 0, y: 0, floors: { f1: 'upper' } };
    const tile = { kind: 'image', id: 'roof', x: 0, y: 0, w: 1, h: 1, src: '/a.webp', level: 'f1' };
    const placed = intoWhole('tiles', tile as Chunk['tiles'][number], part);
    expect(placed.level).toBe('upper');
    expect(intoPart('tiles', placed, part)).toEqual(tile);
    expect(docIntoWhole({ id: 'r', points: [[0, 0]], levels: ['f1'] }, part).levels).toEqual(['upper']);
  });
});
