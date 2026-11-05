import { describe, expect, it } from 'vitest';
import { indoorArea, indoorRects, indoorsOn, isIndoors } from './indoors.ts';
import type { Chunk, SceneLevel, Wall } from './schema.ts';

// A hut 4 squares wide and 3 deep (100 px squares) at (200, 200), its roof a
// picture over it, and a meadow around it under the open sky.

const G = 100;
type Tile = Chunk['tiles'][number];

function box([x, y, w, h]: [number, number, number, number], extra: Partial<Wall> = {}): Wall[] {
  const c: [number, number][] = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
  return c.map((a, i) => ({ id: `w${x}-${y}-${i}`, a, b: c[(i + 1) % 4]!, ...extra }));
}

const roof = ([x, y, w, h]: [number, number, number, number], extra: Partial<Tile> = {}): Tile =>
  ({ id: `roof-${x}-${y}`, kind: 'image', src: 'roof.webp', x, y, w, h, overhead: true, ...extra }) as Tile;

const HUT = box([200, 200, 400, 300]);
const HUT_ROOF = roof([200, 200, 400, 300]);

describe('indoorArea', () => {
  it('counts a roofed room closed by walls as indoors, and the meadow as outside', () => {
    const area = indoorArea(HUT, [HUT_ROOF], G);
    expect(isIndoors(area, [400, 350])).toBe(true);
    expect(isIndoors(area, [250, 250])).toBe(true);
    expect(isIndoors(area, [100, 100])).toBe(false);
    expect(isIndoors(area, [700, 350])).toBe(false);
  });

  it('lets the sky in when a wall is missing', () => {
    const open = HUT.slice(0, 3);
    expect(isIndoors(indoorArea(open, [HUT_ROOF], G), [400, 350])).toBe(false);
  });

  it('lets the sky in through an open door or a window, not a closed door', () => {
    const [top, ...rest] = HUT;
    const door = (state: 'open' | 'closed'): Wall[] => [{ ...top!, door: state }, ...rest];
    expect(isIndoors(indoorArea(door('closed'), [HUT_ROOF], G), [400, 350])).toBe(true);
    expect(isIndoors(indoorArea(door('open'), [HUT_ROOF], G), [400, 350])).toBe(false);
    const window: Wall[] = [{ ...top!, sight: 'none', light: 'none' }, ...rest];
    expect(isIndoors(indoorArea(window, [HUT_ROOF], G), [400, 350])).toBe(false);
  });

  it('keeps a walled yard with no roof outside, and a canopy over open ground', () => {
    expect(isIndoors(indoorArea(HUT, [], G), [400, 350])).toBe(false);
    expect(isIndoors(indoorArea([], [HUT_ROOF], G), [400, 350])).toBe(false);
  });

  it('keeps the part of a room the roof leaves open outside, all of that room', () => {
    const half = roof([200, 200, 200, 300]);
    expect(isIndoors(indoorArea(HUT, [half], G), [250, 350])).toBe(false);
  });

  it('closes a room with two roofs that together cover it', () => {
    const area = indoorArea(HUT, [roof([200, 200, 200, 300]), roof([400, 200, 200, 300])], G);
    expect(isIndoors(area, [250, 350])).toBe(true);
    expect(isIndoors(area, [550, 350])).toBe(true);
  });

  it('follows a turned roof', () => {
    // A long hut on its side under a roof turned a quarter round about its centre.
    const walls = box([300, 100, 200, 400]);
    const turned = roof([200, 200, 400, 200], { rotation: 90 });
    expect(isIndoors(indoorArea(walls, [turned], G), [400, 300])).toBe(true);
  });

  it('draws the indoors as rectangles inside the walls', () => {
    const rects = indoorRects(indoorArea(HUT, [HUT_ROOF], G));
    const area = rects.reduce((sum, r) => sum + r.w * r.h, 0);
    expect(area).toBe(400 * 300);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(200);
      expect(r.x + r.w).toBeLessThanOrEqual(600);
    }
  });
});

describe('indoorsOn', () => {
  const LEVELS: SceneLevel[] = [
    { id: 'ground', name: 'Ground', bottom: 0, top: 9 },
    { id: 'upstairs', name: 'Upstairs', bottom: 10, top: 19 },
  ];
  const upstairsFloor = roof([200, 200, 400, 300], { level: 'upstairs' });
  const groundWalls = box([200, 200, 400, 300], { level: 'ground', height: { bottom: 0, top: 9 } });

  it('roofs the ground floor with the floor above it', () => {
    const area = indoorsOn({ tiles: [upstairsFloor], walls: groundWalls }, LEVELS, 'ground', G);
    expect(isIndoors(area, [400, 350])).toBe(true);
  });

  it("does not count a floor's own picture as its roof", () => {
    const area = indoorsOn(
      { tiles: [upstairsFloor], walls: box([200, 200, 400, 300], { level: 'upstairs' }) },
      LEVELS,
      'upstairs',
      G,
    );
    expect(isIndoors(area, [400, 350])).toBe(false);
  });

  it('ignores walls of another floor and hidden roofs', () => {
    const upWalls = box([200, 200, 400, 300], { level: 'upstairs' });
    expect(isIndoors(indoorsOn({ tiles: [upstairsFloor], walls: upWalls }, LEVELS, 'ground', G), [400, 350])).toBe(
      false,
    );
    const hidden = roof([200, 200, 400, 300], { hidden: true });
    expect(isIndoors(indoorsOn({ tiles: [hidden], walls: HUT }, undefined, undefined, G), [400, 350])).toBe(false);
  });
});
