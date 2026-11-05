import { describe, expect, it } from 'vitest';
import { TileSchema } from './schema.ts';

const image = { id: 'roof', kind: 'image', x: 0, y: 0, w: 400, h: 300, src: 'roofs/inn.webp' };

describe('image tiles', () => {
  it('can be roofs that fade for creatures under them, and scroll', () => {
    const roof = TileSchema.parse({ ...image, overhead: true, occludedAlpha: 0.3, scroll: { x: 20, y: 0 } });
    expect(roof).toMatchObject({ overhead: true, occludedAlpha: 0.3, scroll: { x: 20, y: 0 } });
    expect(TileSchema.safeParse({ ...image, occludedAlpha: 2 }).success).toBe(false);
  });
});

describe('described tiles', () => {
  it('carry a description players read when they inspect them', () => {
    const lever = TileSchema.parse({ ...image, name: 'Lever', description: 'A rusty lever in the wall.' });
    expect(lever).toMatchObject({ name: 'Lever', description: 'A rusty lever in the wall.' });
  });
});

describe('door models', () => {
  it('move with a door wall: swing, slide, lift, fade or play their own animation', () => {
    const door = TileSchema.parse({
      ...image,
      model: { src: 'door.glb' },
      door: { wall: 'cell-door', style: 'swing', angle: 90, ms: 400 },
    });
    expect(door).toMatchObject({ door: { wall: 'cell-door', style: 'swing', angle: 90, ms: 400 } });
    expect(TileSchema.safeParse({ ...image, door: { wall: 'x', style: 'spin' } }).success).toBe(false);
    expect(TileSchema.safeParse({ ...image, door: { style: 'swing' } }).success).toBe(false);
  });
});
