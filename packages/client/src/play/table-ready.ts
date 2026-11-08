// The GM's checklist on a table that isn't ready for a fight yet (the
// getting-ready card, ui/TableReady.tsx): a map, the players' characters
// and something to fight.

/** What the current scene holds, counted. */
export interface TableCounts {
  /** Tiles: a map picture, models. */
  tiles: number;
  /** The party's creatures on the map. */
  party: number;
  /** Players who aren't the GM. */
  seats: number;
  /** Creatures on the map that aren't the party's. */
  foes: number;
}

export type ReadyKey = 'map' | 'heroes' | 'foes';

export interface ReadyStep {
  key: ReadyKey;
  done: boolean;
}

export function readySteps(c: TableCounts): ReadyStep[] {
  return [
    { key: 'map', done: c.tiles > 0 },
    { key: 'heroes', done: c.seats > 0 && c.party >= c.seats },
    { key: 'foes', done: c.foes > 0 },
  ];
}

export const tableReady = (c: TableCounts): boolean => readySteps(c).every((s) => s.done);
