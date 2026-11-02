import { describe, expect, it } from 'vitest';
import { measureRuler } from './ruler.ts';
import { regionCost } from './regions.ts';
import type { Region } from './scene-items.ts';

const g = 100;
const free = { gridSize: g, gridless: true };
const squares = { gridSize: g, gridless: false };

/** Difficult ground over x 300..600, all the way down. */
const mud: Region = {
  id: 'mud',
  points: [
    [300, -1000],
    [600, -1000],
    [600, 1000],
    [300, 1000],
  ],
  behaviors: [{ type: 'difficult' }],
};

describe('measuring without a grid', () => {
  it('measures each leg as the crow flies and adds them up', () => {
    const m = measureRuler(
      [
        [0, 0],
        [300, 400],
        [300, 0],
      ],
      free,
    );
    expect(m.legs.map((l) => l.feet)).toEqual([25, 20]);
    expect(m.feet).toBe(45);
    expect(m.cost).toBe(45);
  });

  it('rounds the total from the exact length, not from rounded legs', () => {
    const m = measureRuler(
      [
        [0, 0],
        [30, 0],
        [60, 0],
      ],
      free,
    );
    expect(m.legs.map((l) => l.feet)).toEqual([2, 2]);
    expect(m.feet).toBe(3);
  });

  it('costs double across difficult ground', () => {
    const m = measureRuler(
      [
        [0, 50],
        [900, 50],
      ],
      { ...free, cost: regionCost([mud], 0) },
    );
    expect(m.feet).toBe(45);
    expect(m.cost).toBe(60);
  });

  it('is nothing for a single point', () => {
    const m = measureRuler([[10, 10]], free);
    expect(m).toMatchObject({ legs: [], feet: 0, cost: 0 });
  });
});

describe('measuring on a square grid', () => {
  it('snaps waypoints to square centres and counts every square, diagonals too, as 5 ft', () => {
    const m = measureRuler(
      [
        [10, 10],
        [390, 190],
      ],
      squares,
    );
    expect(m.points).toEqual([
      [50, 50],
      [350, 150],
    ]);
    expect(m.feet).toBe(15);
  });

  it('drops a waypoint on the same square as the one before', () => {
    const m = measureRuler(
      [
        [10, 10],
        [90, 90],
        [250, 50],
      ],
      squares,
    );
    expect(m.points).toHaveLength(2);
    expect(m.legs).toHaveLength(1);
  });

  it('counts the squares entered on difficult ground twice', () => {
    const m = measureRuler(
      [
        [50, 50],
        [850, 50],
      ],
      { ...squares, cost: regionCost([mud], 0) },
    );
    // Squares 1..8 entered; 3, 4 and 5 are in the mud.
    expect(m.feet).toBe(40);
    expect(m.cost).toBe(55);
  });
});
