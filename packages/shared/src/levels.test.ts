import { describe, expect, it } from 'vitest';
import { levelAt, levelsSeen, onLevel, onLevels, levelChoices, levelBelow, sameFloor, wallsOnFloor } from './levels.ts';
import type { SceneLevel } from './schema.ts';

const levels: SceneLevel[] = [
  { id: 'loft', name: 'Loft', bottom: 10, top: 20, sees: ['ground'] },
  { id: 'cellar', name: 'Cellar', bottom: -10 },
  { id: 'ground', name: 'Ground', bottom: 0 },
];

describe('levels', () => {
  it('finds the level an elevation reaches', () => {
    expect(levelAt(levels, 12)?.id).toBe('loft');
    expect(levelAt(levels, -30)?.id).toBe('cellar');
  });

  it('sees its own level and those it names, bottom first', () => {
    expect(levelsSeen(levels, 'loft')).toEqual(['ground', 'loft']);
    expect(levelsSeen(levels, 'ground')).toEqual(['ground']);
    expect(levelsSeen(levels, undefined)).toBeUndefined();
  });

  it('puts an item on several levels', () => {
    expect(onLevel({ levels: ['ground', 'loft'] }, 'loft')).toBe(true);
    expect(onLevel({ levels: ['ground'] }, 'loft')).toBe(false);
    expect(onLevel({ level: 'cellar', levels: ['loft'] }, 'cellar')).toBe(true);
    expect(onLevels({ level: 'ground' }, ['ground', 'loft'])).toBe(true);
    expect(onLevels({ level: 'cellar' }, ['ground', 'loft'])).toBe(false);
    expect(onLevels({ level: 'cellar' }, undefined)).toBe(true);
  });

  it('offers the floors an elevator serves, but not the one you are on', () => {
    expect(levelChoices(levels, ['cellar', 'ground', 'loft'], 'ground').map((l) => l.id)).toEqual(['cellar', 'loft']);
    expect(levelChoices(levels, undefined, 'ground').map((l) => l.id)).toEqual(['cellar', 'loft']);
  });

  describe('a creature on its floor', () => {
    const walls = [
      { id: 'ground-wall', a: [0, 0] as [number, number], b: [0, 9], level: 'ground', height: { bottom: 0, top: 9 } },
      { id: 'loft-wall', a: [0, 0] as [number, number], b: [0, 9], level: 'loft', height: { bottom: 10, top: 19 } },
      { id: 'loft-rail', a: [0, 0] as [number, number], b: [0, 9], level: 'loft' },
      { id: 'tower', a: [0, 0] as [number, number], b: [0, 9], height: { bottom: 0, top: 59 } },
    ];
    const ids = (ws: { id: string }[]) => ws.map((w) => w.id);

    it('is blocked only by the walls of its own floor, standing at 0 ft when it has no elevation', () => {
      expect(ids(wallsOnFloor(walls, levels, {}))).toEqual(['ground-wall', 'tower']);
      expect(ids(wallsOnFloor(walls, levels, { elevation: 10 }))).toEqual(['loft-wall', 'loft-rail', 'tower']);
      expect(ids(wallsOnFloor(walls, undefined, {}))).toEqual(['ground-wall', 'loft-rail', 'tower']);
    });

    it('meets only creatures on its own floor', () => {
      expect(sameFloor(levels, {}, { elevation: 5 })).toBe(true);
      expect(sameFloor(levels, {}, { elevation: 10 })).toBe(false);
      expect(sameFloor(undefined, {}, { elevation: 10 })).toBe(true);
    });

    it('falls to the floor just below', () => {
      expect(levelBelow(levels, 'loft')?.id).toBe('ground');
      expect(levelBelow(levels, 'ground')?.id).toBe('cellar');
      expect(levelBelow(levels, 'cellar')).toBeUndefined();
    });
  });
});
