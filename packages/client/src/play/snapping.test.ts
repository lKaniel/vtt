import { describe, expect, it } from 'vitest';
import type { Chunk, Wall } from '@vtt/shared';
import { TokenSchema } from '@vtt/system-dnd5e';
import { interactSpot, snapAt } from './snapping.ts';

const G = 100;
const goblin = TokenSchema.parse({ id: 'gob', name: 'Goblin', x: 500, y: 500 });
const door: Wall = { id: 'door', a: [800, 0], b: [800, 100], door: 'closed' };
const wall: Wall = { id: 'w', a: [800, 100], b: [800, 500] };
const lever = {
  id: 'lever',
  kind: 'rect',
  x: 200,
  y: 200,
  w: 50,
  h: 50,
  color: '#888',
  trigger: { on: 'click', actions: [] },
};
const chunks = new Map<string, Chunk>([
  ['0,0', { walls: [door, wall], tiles: [lever], lights: [] } as unknown as Chunk],
]);
const scene = { tokens: [goblin], chunks, gridSize: G, gm: false };

describe('snapAt', () => {
  it('snaps to a creature near the pointer, at its centre', () => {
    expect(snapAt([555, 470], scene)).toMatchObject({ kind: 'token', id: 'gob', at: [500, 500], name: 'Goblin' });
    expect(snapAt([700, 700], scene)).toBeUndefined();
  });

  it('snaps to the middle of a door, and to a tile that answers clicks', () => {
    expect(snapAt([790, 60], scene)).toMatchObject({ kind: 'door', chunk: '0,0', wall: door, at: [800, 50] });
    expect(snapAt([210, 240], scene)).toMatchObject({ kind: 'tile', id: 'lever', at: [225, 225] });
  });

  it('leaves out what you may not use: your own walls, and creatures not listed', () => {
    expect(snapAt([800, 300], scene)).toBeUndefined();
    expect(snapAt([555, 470], { ...scene, tokens: [] })).toBeUndefined();
  });
});

describe('interactSpot', () => {
  const walker = { x: 100, y: 50, r: 50 };

  it('walks up next to a creature', () => {
    const [x, y] = interactSpot(walker, snapAt([500, 500], scene)!, G);
    expect(Math.hypot(x - 500, y - 500)).toBeCloseTo(102);
  });

  it('stands just in front of a door, on the side the walker comes from', () => {
    const [x, y] = interactSpot(walker, snapAt([800, 50], scene)!, G);
    expect(y).toBe(50);
    expect(x).toBeLessThan(800 - 50);
    expect(x).toBeGreaterThan(800 - 60);
  });
});
