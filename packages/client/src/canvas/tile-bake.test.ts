import { describe, expect, it } from 'vitest';
import { bakeRuns, bakeScale, cellsOver, overlaps, roofStill, tileBounds, tileStill } from './tile-bake.ts';

// Still tiles are drawn once into map pieces (cells) and shown as pictures;
// tiles that move, answer clicks or glow as objects stay live, between the baked runs.

describe('bake scale', () => {
  it('bakes at the power of two at or above the screen pixels per map pixel', () => {
    expect(bakeScale(0.6)).toBe(1);
    expect(bakeScale(0.3)).toBe(0.5);
    expect(bakeScale(0.25)).toBe(0.25);
    expect(bakeScale(1.25)).toBe(2);
  });

  it('stays between a sixteenth and two', () => {
    expect(bakeScale(0.001)).toBe(1 / 16);
    expect(bakeScale(5)).toBe(2);
  });
});

describe('cells over a rectangle', () => {
  it('lists every cell the rectangle touches', () => {
    expect(cellsOver({ x: 900, y: -10, w: 200, h: 20 }, 1000)).toEqual([
      [0, -1],
      [1, -1],
      [0, 0],
      [1, 0],
    ]);
  });
});

describe('tile bounds', () => {
  it('pads a plain tile for shadows and rough edges', () => {
    expect(tileBounds({ x: 100, y: 200, w: 400, h: 200 }, 10)).toEqual({ x: 90, y: 190, w: 420, h: 220 });
  });

  it('covers a turned tile where it is drawn', () => {
    const b = tileBounds({ x: 0, y: 0, w: 400, h: 100, rotation: 90 }, 0);
    expect(b.x).toBeCloseTo(150);
    expect(b.y).toBeCloseTo(-150);
    expect(b.w).toBeCloseTo(100);
    expect(b.h).toBeCloseTo(400);
  });

  it('tells rectangles that overlap', () => {
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });
});

describe('still tiles', () => {
  const picture = { kind: 'image' as const, id: 'a', x: 0, y: 0, w: 100, h: 100, src: '/assets/floor.webp' };

  it('bakes plain pictures and painted ground', () => {
    expect(tileStill(picture, false)).toBe(true);
    expect(tileStill({ kind: 'rect', id: 'r', x: 0, y: 0, w: 100, h: 100, color: '#333' }, false)).toBe(true);
  });

  it('keeps videos, GIFs, scrolling pictures and roofs live', () => {
    expect(tileStill({ ...picture, src: '/assets/torch.webm' }, false)).toBe(false);
    expect(tileStill({ ...picture, src: '/assets/fire.gif' }, false)).toBe(false);
    expect(tileStill({ ...picture, scroll: { x: 10, y: 0 } }, false)).toBe(false);
    expect(tileStill({ ...picture, overhead: true }, false)).toBe(false);
  });

  it('keeps a tile you can click live', () => {
    const lever = {
      ...picture,
      trigger: { on: 'click' as const, actions: [{ type: 'message' as const, text: 'Click' }] },
    };
    expect(tileStill(lever, false)).toBe(false);
  });

  it('keeps an object with a description live, so it can glow under the pointer', () => {
    expect(tileStill({ ...picture, description: 'A dusty statue.' }, false)).toBe(false);
  });
});

describe('still roofs', () => {
  const roof = {
    kind: 'image' as const,
    id: 'r',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    src: '/assets/roof.webp',
    overhead: true,
  };

  it('bakes a roof while it is fully drawn', () => {
    expect(roofStill(roof, false, 1)).toBe(true);
  });

  it('keeps a roof live while it fades, and an animated one always', () => {
    expect(roofStill(roof, false, 0.6)).toBe(false);
    expect(roofStill({ ...roof, src: '/assets/smoke.webm' }, false, 1)).toBe(false);
  });
});

describe('bake runs', () => {
  const at = (x: number) => ({ x, y: 0, w: 100, h: 100 });

  it('cuts the draw order into runs of still tiles where a live one sits under a still one', () => {
    const tiles = [
      { id: 'floor', z: 0, still: true, bounds: at(0) },
      { id: 'rug', z: 2, still: true, bounds: at(0) },
      { id: 'torch', z: 3, still: false, bounds: at(0) },
      { id: 'table', z: 5, still: true, bounds: at(50) },
      { id: 'water', z: 1, still: true, bounds: at(0) },
    ];
    expect(bakeRuns(tiles)).toEqual([
      { run: { key: '', z: 0, items: [tiles[0], tiles[4], tiles[1]] } },
      { tile: tiles[2] },
      { run: { key: 'torch', z: 5, items: [tiles[3]] } },
    ]);
  });

  it('lets a live tile rise over still ones that do not cover it, so the run stays whole', () => {
    const tiles = [
      { id: 'floor', z: 0, still: true, bounds: at(0) },
      { id: 'torch', z: 1, still: false, bounds: at(0) },
      { id: 'table', z: 2, still: true, bounds: at(500) },
      { id: 'lever', z: 3, still: false, bounds: at(500) },
    ];
    expect(bakeRuns(tiles)).toEqual([
      { run: { key: '', z: 0, items: [tiles[0], tiles[2]] } },
      { tile: tiles[1] },
      { tile: tiles[3] },
    ]);
  });

  it('keeps the order of tiles at the same height', () => {
    const tiles = [
      { id: 'a', z: 0, still: true, bounds: at(0) },
      { id: 'b', z: 0, still: false, bounds: at(0) },
      { id: 'c', z: 0, still: true, bounds: at(0) },
    ];
    const ids = bakeRuns(tiles).map((s) => ('run' in s ? s.run.items.map((t) => t.id) : s.tile.id));
    expect(ids).toEqual([['a'], 'b', ['c']]);
  });
});
