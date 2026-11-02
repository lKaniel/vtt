import { TokenSchema, type TokenView } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { aimPoint, dragsFreely, walkOptions } from './walking.ts';

const token = (data: object): TokenView => TokenSchema.parse({ id: 't', name: 'T', x: 150, y: 150, ...data });
const hero = token({ id: 'hero' });
const ogre = token({ id: 'ogre', x: 500, y: 500, size: 2 });
const upstairs = token({ id: 'bat', x: 300, y: 300, elevation: 10 });
const dead: TokenView = { ...token({ id: 'dead', x: 700, y: 100 }), health: 'down' };
const world = { gridSize: 100 };

describe('walking preview', () => {
  it('aims at the very point without a grid, at the square on one', () => {
    expect(aimPoint([137, 262], world)).toEqual([137, 262]);
    expect(aimPoint([137, 262], { ...world, grid: 'square' as const })).toEqual([150, 250]);
  });

  it('walks around the standing creatures on its level, as the server does', () => {
    const opts = walkOptions(world, hero, [hero, ogre, upstairs, dead]);
    expect(opts).toMatchObject({ gridSize: 100, gridless: true, radius: 50 });
    expect(opts.bodies).toEqual([{ x: 500, y: 500, r: 100 }]);
  });
});

describe('the GM dragging in the map editor', () => {
  it('moves tokens to any point without a grid, by squares on one', () => {
    expect(dragsFreely('tokens', world)).toBe(true);
    expect(dragsFreely('tokens', { ...world, grid: 'square' })).toBe(false);
    expect(dragsFreely('walls', world)).toBe(false);
    expect(dragsFreely('tokens', undefined)).toBe(false);
  });
});
