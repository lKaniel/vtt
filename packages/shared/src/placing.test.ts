import { describe, expect, it } from 'vitest';
import { freePlaces, latticeOf, placeToken, segmentsIntersect, uniqueId, uniqueName, type Wall } from './index.ts';

describe('ids and names for new tokens', () => {
  it('turns a name into a free id', () => {
    const taken = new Set(['goblin', 'goblin-2']);
    expect(uniqueId('Goblin', (id) => taken.has(id))).toBe('goblin-3');
    expect(uniqueId("Brother Orrin's Wolf!", () => false)).toBe('brother-orrin-s-wolf');
    expect(uniqueId('???', () => false)).toBe('token');
  });

  it('numbers a name that is already on the map', () => {
    expect(uniqueName('Goblin', ['Wolf'])).toBe('Goblin');
    expect(uniqueName('Goblin', ['Goblin', 'Goblin 2'])).toBe('Goblin 3');
  });
});

describe('placing tokens', () => {
  it('puts odd sizes on a square centre and even sizes on a grid corner', () => {
    const squares = { gridSize: 100 };
    expect(placeToken([130, 270], 1, squares)).toEqual([150, 250]);
    expect(placeToken([130, 270], 2, squares)).toEqual([100, 300]);
    expect(placeToken([130, 270], 3, squares)).toEqual([150, 250]);
  });

  it('puts any size on a hex centre on hexes', () => {
    const hexes = { gridSize: 100, grid: 'hex-rows' };
    const centre = latticeOf('hex-rows', 100).centre([1, 2]);
    expect(placeToken([centre[0] + 20, centre[1] - 15], 1, hexes)).toEqual(centre);
    expect(placeToken([centre[0] + 20, centre[1] - 15], 2, hexes)).toEqual(centre);
  });
});

describe('free places without a grid', () => {
  const room = { gridSize: 100, walls: [] as Wall[], bodies: [] };
  const apart = (p: number[], q: number[]) => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!);

  it('puts the first creature on the exact point aimed at', () => {
    expect(freePlaces([137, 62], 50, 1, room)).toEqual([[137, 62]]);
  });

  it('puts the rest close by, touching but not overlapping anyone', () => {
    const bodies = [{ x: 300, y: 0, r: 50 }];
    const spots = freePlaces([200, 0], 50, 4, { ...room, bodies });
    expect(spots).toHaveLength(4);
    expect(spots[0]).toEqual([200, 0]);
    for (const [i, p] of spots.entries()) {
      expect(apart(p, [300, 0])).toBeGreaterThanOrEqual(99);
      for (const q of spots.slice(i + 1)) expect(apart(p, q)).toBeGreaterThanOrEqual(99);
      expect(apart(p, [200, 0])).toBeLessThan(260);
    }
  });

  it('moves off a spot someone stands on', () => {
    const bodies = [{ x: 200, y: 0, r: 50 }];
    const [p] = freePlaces([210, 0], 50, 1, { ...room, bodies });
    expect(apart(p!, [200, 0])).toBeGreaterThanOrEqual(99);
    expect(apart(p!, [200, 0])).toBeLessThan(160);
  });

  it('keeps them on the aimed side of walls, their bodies off them', () => {
    const walls: Wall[] = [{ id: 'w', a: [250, -1000], b: [250, 1000] }];
    const spots = freePlaces([200, 0], 50, 5, { ...room, walls });
    expect(spots).toHaveLength(5);
    for (const p of spots) {
      expect(segmentsIntersect([200, 0], p, walls[0]!.a, walls[0]!.b)).toBe(false);
      expect(250 - p[0]).toBeGreaterThanOrEqual(44);
    }
  });

  it('still finds room for all of them in a crowd, overlapping only as a last resort', () => {
    const walls: Wall[] = [
      { id: 'n', a: [0, 0], b: [100, 0] },
      { id: 's', a: [0, 100], b: [100, 100] },
      { id: 'w', a: [0, 0], b: [0, 100] },
      { id: 'e', a: [100, 0], b: [100, 100] },
    ];
    expect(freePlaces([50, 50], 50, 3, { ...room, walls })).toHaveLength(3);
  });
});
