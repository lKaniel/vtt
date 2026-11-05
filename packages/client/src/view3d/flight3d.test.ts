import { describe, expect, it } from 'vitest';
import { heightLabel, standAt } from './flight3d.ts';

// Flying in 3D: a creature whose elevation keeps it well above what is under
// it stays up there (with a shadow below); one at or near a surface stands on it.

const REACH = 120;

describe('where a creature stands in 3D', () => {
  it('stands on the surface under it when it is near', () => {
    expect(standAt(0, 0, REACH)).toEqual({ feet: 0 });
    expect(standAt(100, 60, REACH)).toEqual({ feet: 60 });
  });

  it('climbs onto what rises above its feet (a hill)', () => {
    expect(standAt(0, 400, REACH)).toEqual({ feet: 400 });
  });

  it('flies over a surface far below, keeping the ground under it for its shadow', () => {
    expect(standAt(600, 0, REACH)).toEqual({ feet: 600, ground: 0 });
  });

  it('keeps its own height where nothing is under it', () => {
    expect(standAt(600, undefined, REACH)).toEqual({ feet: 600 });
  });

  it('names its height over the ground in feet', () => {
    expect(heightLabel(600, 0, 20)).toBe('30 ft');
    expect(heightLabel(610, 0, 20)).toBe('30 ft');
  });
});
