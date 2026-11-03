import { describe, expect, it } from 'vitest';
import { levelAt, levelsSeen, onLevel, onLevels, levelChoices } from './levels.ts';
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
});
