import { describe, expect, it } from 'vitest';
import type { Chunk } from '@vtt/shared';
import { bakeable, bakeGroupOf, bakePlace, bakePlan, tilePrint } from './bake-plan.ts';

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

  it('leaves doors, triggers, objects, hidden tiles and moving pictures live', () => {
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
    const plan = bakePlan([img('a', 0), img('fire', 1, { src: 'fire.gif' }), img('b', 2), far('c', 3)], undefined);
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

describe('roofs in the bake plan', () => {
  const roof = (id: string, z: number, more: Partial<ChunkTile> = {}) => img(id, z, { overhead: true, ...more });
  const shape = (plan: ReturnType<typeof bakePlan>) =>
    plan.map((g) => [g.roof ? 'roof' : 'floor', g.level, g.tiles.map((t) => t.id)]);
  const levels = [
    { id: 'down', name: 'Down', bottom: 0, top: 10 },
    { id: 'up', name: 'Up', bottom: 10, top: 20 },
  ];

  it('bakes the still roofs into one picture of their own, bottom first', () => {
    const plan = bakePlan([img('a', 0), roof('r1', 1), roof('lines', 2), far('r2', 3, { overhead: true })], undefined);
    expect(shape(plan)).toEqual([
      ['floor', undefined, ['a']],
      ['roof', undefined, ['r1', 'lines', 'r2']],
    ]);
  });

  it('lets a floor tile drawn after a roof into the floor picture: the roof never lies on the ground', () => {
    const plan = bakePlan([img('a', 0), roof('r', 1), img('b', 2)], undefined);
    expect(shape(plan)[0]).toEqual(['floor', undefined, ['a', 'b']]);
  });

  it('keeps a roof live under a roof that stays live: the picture lies on top', () => {
    const tiles = [roof('r', 0), roof('smoke', 1, { src: 'smoke.gif' }), far('r2', 2, { overhead: true })];
    expect(shape(bakePlan(tiles, undefined))).toEqual([['roof', undefined, ['r2']]]);
  });

  it('bakes the roofs of each floor apart', () => {
    const tiles = [
      roof('r', 0, { level: 'down' }),
      far('top', 1, { overhead: true, level: 'up' }),
      far('sky', 2, { overhead: true }),
    ];
    expect(shape(bakePlan(tiles, levels))).toEqual([
      ['roof', 'up', ['top']],
      ['roof', undefined, ['sky']],
      ['roof', 'down', ['r']],
    ]);
  });

  it('keeps a floor’s roof live under a tile of that floor drawn over it', () => {
    const tiles = [roof('r', 0, { level: 'up' }), img('rug', 1, { level: 'up' })];
    expect(shape(bakePlan(tiles, levels))).toEqual([]);
  });
});

describe('where a picture goes on the map', () => {
  const levels = [
    { id: 'down', name: 'Down', bottom: 0, top: 10 },
    { id: 'up', name: 'Up', bottom: 10, top: 20 },
  ];
  const none = { levels: undefined, shown: undefined, current: undefined };
  const onDown = { levels, shown: ['down'], current: 'down' };
  const onUp = { levels, shown: ['down', 'up'], current: 'up' };

  it('lays a floor picture under its tiles and a roof picture over its roofs', () => {
    expect(bakePlace({}, 0, none)).toEqual({ roof: false, z: -0.5 });
    const top = bakePlace({ roof: true }, 0, none)!;
    expect(top.roof).toBe(true);
    expect(top.z).toBeGreaterThan(100_000);
    expect(top.z).toBeLessThan(1_000_000);
  });

  it('keeps the roofs with no floor over every floor', () => {
    const sky = bakePlace({ roof: true }, 0, onDown)!;
    const up = bakePlace({ roof: true, level: 'up' }, 0, onDown)!;
    expect(sky.roof && up.roof).toBe(true);
    expect(sky.z).toBeGreaterThan(up.z);
  });

  it('shows no picture for a floor’s roofs seen from that floor: they lie flat, as tiles', () => {
    expect(bakePlace({ roof: true, level: 'up' }, 0, onUp)).toBeUndefined();
  });

  it('shows no picture for a floor seen from below: its tiles are roofs there', () => {
    expect(bakePlace({ level: 'up' }, 0, onDown)).toBeUndefined();
    expect(bakePlace({ level: 'up' }, 0, onUp)?.roof).toBe(false);
  });
});
