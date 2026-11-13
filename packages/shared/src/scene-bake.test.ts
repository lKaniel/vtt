import { describe, expect, it } from 'vitest';
import {
  BakeManifestSchema,
  bakeBlocksOver,
  bakeFileOk,
  bakePath,
  bakeSpan,
  bakeTopScale,
  bakeZoomFor,
  bakeZooms,
} from './scene-bake.ts';

// An optimised scene's still tiles are one picture per floor, cut into a
// pyramid of square blocks like a web map: zoom 0 the sharpest, each zoom
// after it half as sharp, until the last holds the whole floor in one block.

describe('the bake pyramid', () => {
  it('bakes at full size when the map is small enough, else at a half, a quarter...', () => {
    expect(bakeTopScale({ x: 0, y: 0, w: 4000, h: 3000 })).toBe(1);
    expect(bakeTopScale({ x: 0, y: 0, w: 30_000, h: 30_000 })).toBe(0.5);
    expect(bakeTopScale({ x: 0, y: 0, w: 120_000, h: 120_000 })).toBe(0.125);
  });

  it('covers twice the map with each block per zoom', () => {
    expect(bakeSpan(0.5, 0)).toBe(1024);
    expect(bakeSpan(0.5, 2)).toBe(4096);
  });

  it('has zooms down to one block for the whole floor', () => {
    expect(bakeZooms({ x: 0, y: 0, w: 512, h: 100 }, 1)).toBe(1);
    expect(bakeZooms({ x: 0, y: 0, w: 4000, h: 3000 }, 1)).toBe(4);
  });

  it('picks the coarsest zoom still as sharp as the screen', () => {
    expect(bakeZoomFor(1, 1, 5)).toBe(0);
    expect(bakeZoomFor(2, 1, 5)).toBe(0);
    expect(bakeZoomFor(0.5, 1, 5)).toBe(1);
    expect(bakeZoomFor(0.3, 1, 5)).toBe(1);
    expect(bakeZoomFor(0.01, 1, 5)).toBe(4);
  });

  it('lists the blocks of a zoom over part of the floor', () => {
    const floor = { x: 100, y: 100, w: 3000, h: 2000 };
    expect(bakeBlocksOver(floor, 1, 0, { x: 0, y: 0, w: 700, h: 300 })).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(bakeBlocksOver(floor, 1, 0, { x: 5000, y: 0, w: 10, h: 10 })).toEqual([]);
  });
});

describe('bake files', () => {
  it('names a block by group, zoom and place', () => {
    expect(bakePath(1, 2, [3, 4], 'webp')).toBe('1/2/3_4.webp');
  });

  it('accepts only block pictures and the manifest', () => {
    expect(bakeFileOk('0/3/12_7.webp')).toBe(true);
    expect(bakeFileOk('2/0/1_1.png')).toBe(true);
    expect(bakeFileOk('manifest.json')).toBe(true);
    expect(bakeFileOk('../x.webp')).toBe(false);
    expect(bakeFileOk('0/3/12_7.svg')).toBe(false);
  });

  it('reads a manifest', () => {
    const manifest = {
      v: 1,
      block: 512,
      scale: 1,
      ext: 'webp',
      groups: [{ x: 0, y: 0, w: 600, h: 600, zooms: 2, tiles: { a: 'x1' }, blocks: [['0_0', '1_1'], ['0_0']] }],
    };
    expect(BakeManifestSchema.parse(manifest).groups[0]!.tiles).toEqual({ a: 'x1' });
  });
});
