import { describe, expect, it } from 'vitest';
import { addLevel, editLevel, offLevelUpdates, removeLevel } from './level-edit.ts';
import type { SceneLevel } from './schema.ts';

const ground: SceneLevel = { id: 'ground', name: 'Ground', bottom: 0, top: 10 };
const loft: SceneLevel = { id: 'loft', name: 'Loft', bottom: 10, top: 20, sees: ['ground'] };

describe('editing the floors of a scene', () => {
  it('starts with the ground floor, then stacks each new floor on the top one', () => {
    const first = addLevel(undefined);
    expect(first).toEqual([{ id: 'ground', name: 'Ground', bottom: 0, top: 10 }]);
    const two = addLevel(first);
    expect(two[1]).toEqual({ id: 'floor-2', name: 'Floor 2', bottom: 10, top: 20 });
    const three = addLevel([...two, { id: 'cellar', name: 'Cellar', bottom: -10 }]);
    expect(three.at(-1)).toMatchObject({ id: 'floor-4', bottom: 20, top: 30 });
  });

  it('a floor with no ceiling gets 10 ft', () => {
    expect(addLevel([{ id: 'ground', name: 'Ground', bottom: 0 }]).at(-1)).toMatchObject({ bottom: 10, top: 20 });
  });

  it('renames a floor, moves its heights, and clears what is left empty', () => {
    expect(editLevel([ground, loft], 'loft', { name: 'Attic', top: 25 })[1]).toEqual({
      ...loft,
      name: 'Attic',
      top: 25,
    });
    expect(editLevel([ground, loft], 'loft', { sees: [] })[1]).toEqual({
      id: 'loft',
      name: 'Loft',
      bottom: 10,
      top: 20,
    });
    expect(editLevel([ground, loft], 'loft', { name: '  ' })[1]!.name).toBe('Loft');
  });

  it('removes a floor, and what looked down on it stops', () => {
    expect(removeLevel([ground, loft], 'ground')).toEqual([{ id: 'loft', name: 'Loft', bottom: 10, top: 20 }]);
  });

  it('puts what stood on a removed floor on every floor', () => {
    const docs: Record<string, { id: string; level?: string; levels?: string[] }[]> = {
      'hall/tiles': [{ id: 'bed', level: 'loft' }, { id: 'floor' }],
      'hall/walls': [{ id: 'stair', levels: ['ground', 'loft'] }],
    };
    const src = { all: (coll: string) => (docs[coll] ?? []).map((d) => ({ ...d, type: 'x', rev: 1 })) };
    expect(offLevelUpdates(src, 'hall', 'loft')).toEqual([
      { ref: { coll: 'hall/tiles', id: 'bed' }, patch: { level: null } },
      { ref: { coll: 'hall/walls', id: 'stair' }, patch: { levels: ['ground'] } },
    ]);
  });
});
