import { describe, expect, it } from 'vitest';
import { readySteps, tableReady } from './table-ready.ts';

describe('getting the table ready', () => {
  const empty = { tiles: 0, party: 0, seats: 2, foes: 0 };

  it('lists a map, the players’ characters and creatures, each done once it is there', () => {
    expect(readySteps(empty)).toEqual([
      { key: 'map', done: false },
      { key: 'heroes', done: false },
      { key: 'foes', done: false },
    ]);
    expect(readySteps({ tiles: 1, party: 2, seats: 2, foes: 3 }).every((s) => s.done)).toBe(true);
  });

  it('counts the heroes as there once every player has one on the map', () => {
    expect(readySteps({ ...empty, party: 1 })[1]).toEqual({ key: 'heroes', done: false });
    expect(readySteps({ ...empty, party: 2 })[1]).toEqual({ key: 'heroes', done: true });
    expect(readySteps({ ...empty, seats: 0, party: 0 })[1]).toEqual({ key: 'heroes', done: false });
  });

  it('is ready when every step is done', () => {
    expect(tableReady(empty)).toBe(false);
    expect(tableReady({ tiles: 4, party: 2, seats: 2, foes: 1 })).toBe(true);
  });
});
