import type { FoundryDoc } from './foundry-db.ts';

// Which Foundry document each converted tile, wall, light, sound, region
// and token came from, for the parts that point at them later by Foundry id
// or Tagger tag (Monk's Active Tiles). Kept beside the objects, so nothing
// of it is written to the game.

const ORIGIN = new WeakMap<object, FoundryDoc>();

/** `ours`, remembered as made from the Foundry document `raw`. */
export function madeFrom<T extends object>(ours: T, raw: unknown): T {
  if (raw && typeof raw === 'object') ORIGIN.set(ours, raw as FoundryDoc);
  return ours;
}

/** `after` (a copy of `before`, given its id), made from what `before` was. */
export function carried<T extends object>(before: object, after: T): T {
  const raw = ORIGIN.get(before);
  if (raw) ORIGIN.set(after, raw);
  return after;
}

/** The Foundry document `ours` was made from, if it is known. */
export const originOf = (ours: object): FoundryDoc | undefined => ORIGIN.get(ours);
