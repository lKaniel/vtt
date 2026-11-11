import type { DrawnTile, Wall } from '@vtt/shared';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Play3D, type Play3DHost } from './play3d.ts';

// Play under the 3D view: the doors on the floor shown hang leaves, the door
// models move with their walls, and pointing at a door lights its model.

const wall = (id: string, door?: Wall['door']): Wall => ({ id, a: [0, 0], b: [100, 0], ...(door && { door }) });

function host(walls: Wall[], copies: Record<string, THREE.Object3D[]> = {}): Play3DHost {
  return {
    map: { effects: {}, tokens: { placeOf: () => undefined, release: () => undefined } },
    session: {
      tokens: new Map(),
      chunks: new Map([['0_0', { walls, lights: [] }]]),
      world: undefined,
      isGm: () => false,
    },
    floor: () => 0,
    groundAt: () => 0,
    surfaceAt: () => 0,
    px: () => 20,
    grid: () => 100,
    target: () => [0, 0],
    copiesOf: (key: string) => copies[key] ?? [],
    indoors: () => false,
  } as unknown as Play3DHost;
}

const chestTile = {
  id: 'chest',
  kind: 'image',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  src: '',
  model: { src: '/assets/chest.glb' },
  door: { wall: 'lid', style: 'lift', slide: 100, ms: 100 },
} as unknown as DrawnTile;

describe('play in 3D', () => {
  it('shines as many scene lights at once as the graphics setting allows', () => {
    const lightsIn = (play: Play3D) => {
      let n = 0;
      play.group.traverse((o) => (n += o instanceof THREE.PointLight ? 1 : 0));
      return n;
    };
    expect(lightsIn(new Play3D(host([]), 2))).toBe(2);
    expect(lightsIn(new Play3D(host([]), 12))).toBe(12);
  });

  it('hangs leaves on plain doors only, leaving the doors a model moves to the model', () => {
    const walls = [wall('front', 'closed'), wall('lid', 'closed'), wall('plain')];
    const play = new Play3D(host(walls));
    play.doors(walls, { bottom: 0, grid: 100 }, [chestTile]);
    play.frame([], 0);
    const leaves = play.group.children.find((g) => g.children.some((c) => c.userData.door));
    expect(leaves?.children.map((c) => c.userData.door as string)).toEqual(['front']);
  });

  it('lifts a door model as its wall opens', () => {
    const walls = [wall('lid', 'open')];
    const copy = new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1)));
    const play = new Play3D(host(walls, { 'tile:chest': [copy] }));
    play.doors(walls, { bottom: 0, grid: 100 }, [chestTile]);
    play.frame([], 0);
    expect(copy.children[0]!.position.y).toBeCloseTo(2);
  });

  it('lights the model a door moves, or a tile, under the pointer', () => {
    const walls = [wall('lid', 'closed')];
    const play = new Play3D(host(walls));
    play.doors(walls, { bottom: 0, grid: 100 }, [chestTile]);
    expect(play.glowOf({ kind: 'door', chunk: '0_0', id: 'lid' })).toBe('tile:chest');
    expect(play.glowOf({ kind: 'door', chunk: '0_0', id: 'other' })).toBeUndefined();
    expect(play.glowOf({ kind: 'tile', id: 'statue' })).toBe('tile:statue');
    expect(play.glowOf(undefined)).toBeUndefined();
  });

  it('floats a marker over a lever you may click', () => {
    const play = new Play3D(host([]));
    const lever = {
      ...chestTile,
      id: 'lever',
      door: undefined,
      trigger: { on: 'click', actions: [{ type: 'message', text: 'Clunk' }] },
    } as unknown as DrawnTile;
    play.doors([], { bottom: 0, grid: 100 }, [lever]);
    const marks: THREE.Object3D[] = [];
    play.group.traverse((o) => o.userData.trigger === 'lever' && marks.push(o));
    expect(marks).toHaveLength(1);
  });
});
