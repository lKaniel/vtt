import type { Point } from './schema.ts';

// Names, ids and squares for things put on a scene: tokens, actors, games.

/** A lowercase-dash id made from `name` that `taken` doesn't know yet. */
export function uniqueId(name: string, taken: (id: string) => boolean): string {
  const base =
    name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .join('-') || 'token';
  if (!taken(base)) return base;
  let n = 2;
  while (taken(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** `name`, numbered ("Goblin 2") when a creature on the map already has it. */
export function uniqueName(name: string, names: Iterable<string>): string {
  const used = new Set(names);
  if (!used.has(name)) return name;
  let n = 2;
  while (used.has(`${name} ${n}`)) n++;
  return `${name} ${n}`;
}

/** Where a token of `size` squares dropped at `p` stands: odd sizes on a square centre, even ones on a corner. */
export function placeToken(p: Point, size: number, gridSize: number): Point {
  const offset = Math.round(size) % 2 === 1 ? 0.5 : 0;
  const snap = (v: number) => (Math.round(v / gridSize - offset) + offset) * gridSize;
  return [snap(p[0]), snap(p[1])];
}
