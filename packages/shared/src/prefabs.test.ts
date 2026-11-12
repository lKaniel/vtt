import { describe, expect, it } from 'vitest';
import { prefabClip, PrefabSchema } from './prefabs.ts';

const tile = { id: 'lamp', kind: 'image', x: 0, y: 0, w: 100, h: 100, src: 'pack://bw/media/lamp.webp' };

describe('prefabs', () => {
  it('still reads the old tiles-only prefab', () => {
    const p = PrefabSchema.parse({ id: 'cart', name: 'Cart', tiles: [tile] });
    expect(p.tiles).toHaveLength(1);
    expect(p.walls).toEqual([]);
    expect(p.lights).toEqual([]);
  });

  it('holds walls, lights and sounds that come with the tiles, with tags and a thumbnail', () => {
    const p = PrefabSchema.parse({
      id: 'lamppost',
      name: 'Street lamppost',
      tags: ['lighting', 'town'],
      thumb: 'pack://bw/media/lamp-thumb.webp',
      tiles: [tile],
      walls: [{ id: 'w', a: [0, 0], b: [100, 0] }],
      lights: [{ id: 'l', x: 50, y: 50, bright: 15, dim: 30 }],
      sounds: [{ id: 's', x: 50, y: 50, radius: 20, src: 'pack://bw/media/fire.ogg' }],
    });
    expect(p.tags).toEqual(['lighting', 'town']);
    expect(p.walls).toHaveLength(1);
    expect(p.lights[0]).toMatchObject({ bright: 15 });
    expect(p.sounds).toHaveLength(1);
  });

  it('keeps how it varies each time it is placed', () => {
    const p = PrefabSchema.parse({
      id: 'stalagmites',
      name: 'Brush: Stalagmites',
      tiles: [tile, { ...tile, id: 'b' }],
      pick: 'one',
      vary: {
        scale: [0.9, 2.7],
        rotation: [0, 45],
        tint: ['#cfd4ab', '#745a11'],
        pictures: ['pack://bw/media/a.webp'],
      },
      fill: true,
    });
    expect(p.pick).toBe('one');
    expect(p.vary?.scale).toEqual([0.9, 2.7]);
    expect(p.fill).toBe(true);
  });

  it('needs something to place', () => {
    expect(PrefabSchema.safeParse({ id: 'empty', name: 'Empty' }).success).toBe(false);
    expect(
      PrefabSchema.safeParse({ id: 'light', name: 'Light', lights: [{ id: 'l', x: 0, y: 0, bright: 5 }] }).success,
    ).toBe(true);
  });
});

describe('placing a prefab', () => {
  const lamp = PrefabSchema.parse({
    id: 'lamppost',
    name: 'Lamppost',
    tiles: [tile, { ...tile, id: 'top', x: 0, y: 0 }],
    walls: [{ id: 'w', a: [0, 0], b: [100, 0] }],
    lights: [{ id: 'l', x: 50, y: 50, bright: 15 }],
  });
  const fixed = () => 0.5;

  it('puts its tiles in a group named after it, with the walls and lights fastened to the group', () => {
    const docs = prefabClip(lamp, { random: fixed }).docs;
    const group = docs.find((d) => d.type === 'tile' && d.kind === 'group')!;
    expect(group).toMatchObject({ name: 'Lamppost' });
    expect(docs.filter((d) => d.type === 'tile' && d.kind === 'image').map((d) => d.parent)).toEqual([
      group.id,
      group.id,
    ]);
    expect(docs.find((d) => d.type === 'wall')).toMatchObject({ tile: group.id, a: [0, 0], b: [100, 0] });
    expect(docs.find((d) => d.type === 'light')).toMatchObject({ tile: group.id, x: 50, y: 50 });
  });

  it('keeps a lone tile out of a group, and fastens to it', () => {
    const one = PrefabSchema.parse({
      id: 'one',
      name: 'One',
      tiles: [tile],
      lights: [{ id: 'l', x: 50, y: 50, bright: 5 }],
    });
    const docs = prefabClip(one, { random: fixed }).docs;
    expect(docs.filter((d) => d.type === 'tile')).toHaveLength(1);
    expect(docs.find((d) => d.type === 'light')).toMatchObject({ tile: 'lamp' });
  });

  it('puts down one tile of a brush, picked at random', () => {
    const brush = PrefabSchema.parse({
      id: 'b',
      name: 'B',
      pick: 'one',
      tiles: [1, 2, 3].map((n) => ({ ...tile, id: `t${n}` })),
    });
    expect(prefabClip(brush, { random: () => 0.99 }).docs.map((d) => d.id)).toEqual(['t3']);
    expect(prefabClip(brush, { random: () => 0 }).docs.map((d) => d.id)).toEqual(['t1']);
  });

  it('scales and turns everything about its middle, and picks a tint and picture', () => {
    const vary = PrefabSchema.parse({
      id: 'v',
      name: 'V',
      tiles: [tile],
      walls: [{ id: 'w', a: [0, 0], b: [100, 0] }],
      lights: [{ id: 'l', x: 100, y: 50, bright: 10, dim: 20 }],
      vary: {
        scale: [1, 3],
        rotation: [0, 180],
        tint: ['#ff0000', '#00ff00'],
        pictures: ['pack://bw/a.webp', 'pack://bw/b.webp'],
      },
    });
    const docs = prefabClip(vary, { random: fixed }).docs;
    const t = docs.find((d) => d.type === 'tile')!;
    // Scale 2, turned 90°, about the tile's middle (50, 50).
    expect(t).toMatchObject({ x: -50, y: -50, w: 200, h: 200, rotation: 90, tint: '#00ff00', src: 'pack://bw/b.webp' });
    const w = docs.find((d) => d.type === 'wall')!;
    expect((w.a as number[]).map(Math.round)).toEqual([150, -50]);
    expect((w.b as number[]).map(Math.round)).toEqual([150, 150]);
    const l = docs.find((d) => d.type === 'light')!;
    expect([Math.round(l.x as number), Math.round(l.y as number)]).toEqual([50, 150]);
    expect(l).toMatchObject({ bright: 20, dim: 40 });
  });

  it('stretches over the scene when it fills it', () => {
    const fog = PrefabSchema.parse({ id: 'fog', name: 'Fog', tiles: [tile], fill: true });
    const docs = prefabClip(fog, { random: fixed, scene: { x: 0, y: 0, w: 3000, h: 2000 } }).docs;
    expect(docs[0]).toMatchObject({ x: 0, y: 0, w: 3000, h: 2000 });
  });
});

describe('placing a 3D prefab', () => {
  it('turns and grows its models, not their blank pictures', () => {
    const crate = PrefabSchema.parse({
      id: 'c',
      name: 'Crate',
      tiles: [{ ...tile, src: '/art/ui/blank.svg', model: { src: 'pack://bw/crate.glb', height: 5, rotation: 10 } }],
      vary: { scale: [2, 2], rotation: [90, 90] },
    });
    const [t] = prefabClip(crate, { random: () => 0 }).docs;
    expect(t).toMatchObject({ w: 200, model: { rotation: 100, height: 10 } });
    expect(t!.rotation).toBeUndefined();
  });
});
