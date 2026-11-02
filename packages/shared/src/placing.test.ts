import { describe, expect, it } from 'vitest';
import { latticeOf, placeToken, uniqueId, uniqueName } from './index.ts';

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
