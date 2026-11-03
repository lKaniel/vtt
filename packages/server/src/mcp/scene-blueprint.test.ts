import { describe, expect, it } from 'vitest';
import type { Doc, Op } from '@vtt/core';
import { BlueprintSchema, blueprintBuild } from './scene-blueprint.ts';

// A scene described the way Claude thinks of one (rooms with doors, a torch
// here, three goblins there) turned into the documents the game stores.

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const ctx = (taken: Record<string, string[]> = {}) => ({
  scene: 'crypt',
  gridSize: 100,
  rules: '2014' as const,
  taken: (coll: string, id: string) => (taken[coll] ?? []).includes(id),
});

const build = (bp: unknown, taken?: Record<string, string[]>) => blueprintBuild(BlueprintSchema.parse(bp), ctx(taken));

const created = (ops: Op[], coll: string): Doc[] =>
  ops.flatMap((op) => (op.op === 'create' && op.coll === `crypt/${coll}` ? [op.doc] : []));

const segs = (walls: Doc[]) => walls.map((w) => [w.a, w.b, w.door ?? (w.sight === 'none' ? 'window' : 'wall')]);

describe('a scene blueprint', () => {
  it('walls rooms in once where they touch, with doors and windows cut into the walls', () => {
    const { ops } = build({
      rooms: [
        { name: 'Hall', x: 0, y: 0, w: 4, h: 3, doors: [{ side: 'e', at: 1 }] },
        { name: 'Vault', x: 4, y: 0, w: 2, h: 3, doors: [{ side: 's', at: 0, kind: 'window' }] },
      ],
    });
    const walls = segs(created(ops, 'walls'));
    // The shared wall at x = 400 is there once, split by the door.
    expect(walls.filter(([a, b]) => (a as number[])[0] === 400 && (b as number[])[0] === 400)).toEqual([
      [[400, 0], [400, 100], 'wall'],
      [[400, 200], [400, 300], 'wall'],
      [[400, 100], [400, 200], 'closed'],
    ]);
    // The north walls of both rooms run on as one.
    expect(walls).toContainEqual([[0, 0], [600, 0], 'wall']);
    expect(walls).toContainEqual([[400, 300], [500, 300], 'window']);
    expect(walls).toContainEqual([[500, 300], [600, 300], 'wall']);
  });

  it('floors and lights rooms, and names their walls after them', () => {
    const { ops } = build({ rooms: [{ name: 'Hall', x: 1, y: 1, w: 2, h: 2, floor: 'stone', light: 'torch' }] });
    expect(created(ops, 'tiles')).toEqual([
      expect.objectContaining({ id: 'hall-floor', kind: 'rect', x: 100, y: 100, w: 200, h: 200, texture: 'stone' }),
    ]);
    expect(created(ops, 'lights')).toEqual([
      expect.objectContaining({ id: 'hall-light', x: 200, y: 200, bright: 20, dim: 20, animation: 'flicker' }),
    ]);
    expect(created(ops, 'walls')[0]!.id).toBe('hall-wall-1');
  });

  it('puts points in squares on the square’s centre, and places creatures as spawns', () => {
    const { ops, spawns } = build({
      lights: [{ x: 2, y: 3, preset: 'campfire', name: 'Fire' }],
      tokens: [
        { monster: 'goblin', x: 5, y: 5, count: 3, hidden: true },
        { actor: 'bram', x: 1, y: 1 },
      ],
    });
    expect(created(ops, 'lights')[0]).toMatchObject({ id: 'fire', x: 250, y: 350, bright: 20, dim: 40 });
    expect(spawns).toEqual([
      { from: { kind: 'monster', id: 'goblin', rules: '2014' }, at: [550, 550], hidden: true },
      { from: { kind: 'monster', id: 'goblin', rules: '2014' }, at: [650, 550], hidden: true },
      { from: { kind: 'monster', id: 'goblin', rules: '2014' }, at: [750, 550], hidden: true },
      { from: { kind: 'actor', id: 'bram' }, at: [150, 150] },
    ]);
  });

  it('takes pixels when asked, and walls along a path of any shape', () => {
    const { ops } = build({
      units: 'pixels',
      walls: [
        {
          points: [
            [0, 0],
            [300, 0],
            [150, 260],
          ],
          closed: true,
          kind: 'terrain',
        },
      ],
    });
    const walls = created(ops, 'walls');
    expect(walls.map((w) => [w.a, w.b])).toEqual([
      [
        [0, 0],
        [300, 0],
      ],
      [
        [300, 0],
        [150, 260],
      ],
      [
        [150, 260],
        [0, 0],
      ],
    ]);
    expect(walls[0]).toMatchObject({ sight: 'limited', light: 'limited', sound: 'limited' });
  });

  it('makes regions, tiles, sounds and notes, keeping any other fields given', () => {
    const { ops } = build({
      regions: [{ name: 'Pit', x: 2, y: 2, w: 1, h: 1, behaviors: [{ type: 'trap', message: 'Falls!' }] }],
      tiles: [
        { x: 0, y: 0, w: 10, h: 10, texture: 'grass', background: true },
        { name: 'Statue', x: 3, y: 3, w: 1, h: 1, src: '/assets/statue.webp', shadow: {} },
      ],
      sounds: [{ x: 0, y: 0, radius: 30, src: '/assets/drip.ogg' }],
      notes: [{ x: 4, y: 4, label: 'Altar', entry: 'altar' }],
    });
    expect(created(ops, 'regions')[0]).toMatchObject({
      id: 'pit',
      points: [
        [200, 200],
        [300, 200],
        [300, 300],
        [200, 300],
      ],
      behaviors: [{ type: 'trap', message: 'Falls!' }],
    });
    const [grass, statue] = created(ops, 'tiles');
    expect(grass).toMatchObject({ kind: 'rect', texture: 'grass', background: true, w: 1000 });
    expect(grass!.color).toMatch(/^#/);
    expect(statue).toMatchObject({ id: 'statue', kind: 'image', src: '/assets/statue.webp', shadow: {} });
    expect(created(ops, 'sounds')[0]).toMatchObject({ x: 50, y: 50, radius: 30 });
    expect(created(ops, 'notes')[0]).toMatchObject({ id: 'altar', x: 450, y: 450 });
  });

  it('never reuses an id the scene has', () => {
    const { ops } = build(
      {
        lights: [
          { x: 0, y: 0, preset: 'torch' },
          { x: 1, y: 0, preset: 'torch' },
        ],
      },
      {
        'crypt/lights': ['torch', 'torch-2'],
      },
    );
    expect(created(ops, 'lights').map((l) => l.id)).toEqual(['torch-3', 'torch-4']);
  });

  it('keeps floors apart: rooms on different levels each get their own walls, and stairs join them', () => {
    const { ops } = build({
      rooms: [
        { name: 'Hall', x: 0, y: 0, w: 2, h: 2, level: 'ground', floor: 'stone' },
        { name: 'Loft', x: 0, y: 0, w: 2, h: 2, level: 'loft' },
        { name: 'Tower', x: 2, y: 0, w: 1, h: 1, levels: ['ground', 'loft'] },
      ],
      regions: [
        {
          name: 'Stairs',
          x: 1,
          y: 1,
          w: 1,
          h: 1,
          levels: ['ground', 'loft'],
          behaviors: [{ type: 'stairs', between: ['ground', 'loft'] }],
        },
      ],
    });
    const walls = created(ops, 'walls');
    const north = (level: unknown) =>
      walls.filter((w) => sameJson(w.a, [0, 0]) && sameJson(w.b, [200, 0]) && w.level === level);
    expect(north('ground')).toHaveLength(1);
    expect(north('loft')).toHaveLength(1);
    expect(walls.filter((w) => sameJson(w.levels, ['ground', 'loft']))).toHaveLength(4);
    expect(created(ops, 'tiles')[0]).toMatchObject({ level: 'ground' });
    expect(created(ops, 'regions')[0]).toMatchObject({ levels: ['ground', 'loft'], behaviors: [{ type: 'stairs' }] });
  });
});
