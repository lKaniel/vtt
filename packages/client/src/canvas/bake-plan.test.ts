import { describe, expect, it } from 'vitest';
import type { Chunk } from '@vtt/shared';
import { bakeable, bakeGroupOf, bakePlan, tilePrint } from './bake-plan.ts';

// Which tiles an optimised scene draws into its picture: the still ones, per
// floor, as long as nothing that stays live lies under them.

type ChunkTile = Chunk['tiles'][number];
const img = (id: string, z: number, more: Partial<ChunkTile> = {}): ChunkTile =>
  ({ kind: 'image', id, src: `${id}.webp`, x: z * 10, y: 0, w: 100, h: 100, z, ...more }) as ChunkTile;
const far = (id: string, z: number, more: Partial<ChunkTile> = {}) => img(id, z, { x: 5000 * (z + 1), ...more });

describe('what can be baked', () => {
  it('bakes still pictures and painted ground', () => {
    expect(bakeable(img('a', 0))).toBe(true);
    expect(bakeable({ kind: 'rect', id: 'r', x: 0, y: 0, w: 10, h: 10, color: '#fff', z: 0 })).toBe(true);
  });

  it('leaves roofs, doors, triggers, objects, hidden tiles and moving pictures live', () => {
    expect(bakeable(img('a', 0, { overhead: true }))).toBe(false);
    expect(bakeable(img('a', 0, { door: { wall: 'w', style: 'swing' } }))).toBe(false);
    expect(bakeable(img('a', 0, { trigger: { on: 'click', actions: [] } }))).toBe(false);
    expect(bakeable(img('a', 0, { description: 'A lever' }))).toBe(false);
    expect(bakeable(img('a', 0, { hidden: true }))).toBe(false);
    expect(bakeable(img('a', 0, { src: 'water.webm' }))).toBe(false);
    expect(bakeable(img('a', 0, { src: 'fire.gif' }))).toBe(false);
    expect(bakeable(img('a', 0, { scroll: { x: 1, y: 0 } }))).toBe(false);
  });

  it('groups by floor: one floor, every floor, or several (live)', () => {
    expect(bakeGroupOf(img('a', 0))).toBe('');
    expect(bakeGroupOf(img('a', 0, { level: 'up' }))).toBe('up');
    expect(bakeGroupOf(img('a', 0, { levels: ['up'] }))).toBe('up');
    expect(bakeGroupOf(img('a', 0, { levels: ['up', 'down'] }))).toBeUndefined();
  });
});

describe('the bake plan', () => {
  it('bakes every still tile of a floor into one group', () => {
    const plan = bakePlan([img('a', 0), img('b', 1), img('c', 2)], undefined);
    expect(plan.map((g) => [g.level, g.tiles.map((t) => t.id)])).toEqual([[undefined, ['a', 'b', 'c']]]);
  });

  it('keeps a still tile live when a live tile below it overlaps it', () => {
    const plan = bakePlan([img('a', 0), img('door', 1, { overhead: true }), img('b', 2), far('c', 3)], undefined);
    expect(plan[0]!.tiles.map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('keeps a tile live over one that stayed live (the order holds)', () => {
    const plan = bakePlan([img('gif', 0, { src: 'x.gif' }), img('b', 1), img('c', 2)], undefined);
    expect(plan).toEqual([]);
  });

  it('bakes each floor apart, and a tile over another floor’s stays live', () => {
    const levels = [
      { id: 'down', name: 'Down', bottom: 0, top: 10 },
      { id: 'up', name: 'Up', bottom: 10, top: 20 },
    ];
    const tiles = [img('a', 0), img('b', 1, { level: 'up' }), far('c', 2, { level: 'up' })];
    const plan = bakePlan(tiles, levels);
    expect(plan.map((g) => [g.level, g.tiles.map((t) => t.id)])).toEqual([
      [undefined, ['a']],
      ['up', ['c']],
    ]);
  });

  it('marks how each tile looked, whatever its place in the draw order', () => {
    expect(tilePrint(img('a', 0))).toBe(tilePrint(img('a', 7, { x: 0 })));
    expect(tilePrint(img('a', 0))).not.toBe(tilePrint(img('a', 0, { tint: '#ff0000' })));
  });
});
