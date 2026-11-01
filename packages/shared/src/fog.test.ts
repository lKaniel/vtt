import { describe, expect, it } from 'vitest';
import {
  exploredRasters,
  FOG_BLOCK,
  FogMap,
  rasterCircle,
  rasterize,
  undoFogBlock,
  visibilityPolygon,
  type Wall,
} from './index.ts';

const CELL = 25;
const square = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];

describe('rasterize', () => {
  it('marks the cells whose centres are inside a polygon', () => {
    const r = rasterize(square(0, 0, 100, 50), CELL);
    expect(r).toMatchObject({ x0: 0, y0: 0, w: 4, h: 2 });
    expect([...r.bits].every((b) => b === 1)).toBe(true);
  });

  it('works left of and above the origin', () => {
    const map = new FogMap(CELL);
    map.add(rasterize(square(-100, -100, -50, -50), CELL));
    expect(map.explored([-75, -75])).toBe(true);
    expect(map.explored([-25, -75])).toBe(false);
  });

  it('follows walls when given a sight polygon', () => {
    const wall: Wall = { id: 'w', a: [200, -500], b: [200, 500] };
    const map = new FogMap(CELL);
    map.add(rasterize(visibilityPolygon([0, 0], 400, [wall]), CELL));
    expect(map.explored([150, 0])).toBe(true);
    expect(map.explored([250, 0])).toBe(false);
    expect(map.explored([-350, 0])).toBe(true);
  });
});

describe('FogMap', () => {
  it('says which blocks changed, and only those', () => {
    const map = new FogMap(CELL);
    expect(map.add(rasterCircle([50, 50], 40, CELL))).toEqual(['0_0']);
    expect(map.add(rasterCircle([50, 50], 40, CELL))).toEqual([]);
    const far = FOG_BLOCK * CELL + 10;
    expect(map.add(rasterCircle([far, 10], 5, CELL))).toEqual(['1_0']);
  });

  it('round-trips through its saved form', () => {
    const map = new FogMap(CELL);
    map.add(rasterCircle([300, -300], 100, CELL));
    const back = FogMap.decode(map.encode());
    expect(back.explored([300, -300])).toBe(true);
    expect(back.explored([300, 300])).toBe(false);
    expect(back.encode()).toEqual(map.encode());
  });

  it('hides again with a brush, dropping blocks left empty', () => {
    const map = new FogMap(CELL);
    map.add(rasterCircle([50, 50], 40, CELL));
    expect(map.remove(rasterCircle([50, 50], 200, CELL))).toEqual(['0_0']);
    expect(map.explored([50, 50])).toBe(false);
    expect(Object.keys(map.encode().blocks)).toEqual([]);
  });

  it('undoes a brush without losing what was explored since', () => {
    const map = new FogMap(CELL);
    const before = map.block('0_0');
    map.add(rasterCircle([100, 100], 30, CELL));
    const after = map.block('0_0');
    map.add(rasterCircle([500, 500], 30, CELL));
    map.setBlock('0_0', undoFogBlock(map.block('0_0'), before, after));
    expect(map.explored([100, 100])).toBe(false);
    expect(map.explored([500, 500])).toBe(true);
  });
});

describe('exploredRasters', () => {
  const ctx = (dark: boolean) => ({
    dark,
    lights: [{ id: 'l', x: 1000, y: 0, bright: 10, dim: 0 }],
    polygon: (at: [number, number], radius: number) => visibilityPolygon(at, radius, []),
    sight: 2000,
    gridSize: 100,
    cell: CELL,
  });
  const eye = (darkvision = 0) => ({
    at: [0, 0] as [number, number],
    senses: { darkvision, blindsight: 0, tremorsense: 0, truesight: 0, devilsSight: 0, seeInvisible: false },
  });
  const explored = (dark: boolean, darkvision: number) => {
    const map = new FogMap(CELL);
    for (const r of exploredRasters([eye(darkvision)], ctx(dark))) map.add(r);
    return map;
  };

  it('is everything in sight by day', () => {
    expect(explored(false, 0).explored([1500, 0])).toBe(true);
  });

  it('is what darkvision reaches and what lights show at night', () => {
    const map = explored(true, 30);
    expect(map.explored([500, 0])).toBe(true);
    expect(map.explored([700, 0])).toBe(false);
    expect(map.explored([1000, 150])).toBe(true);
    expect(map.explored([1500, 0])).toBe(false);
  });
});
