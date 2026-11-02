import type { Point } from './schema.ts';
import { gridKind, latticeOf, snapToCell } from './grid.ts';

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

/**
 * Where a token of `size` cells dropped at `p` stands: on hexes, on a hex
 * centre; otherwise odd sizes on a square centre and even ones on a corner.
 */
export function placeToken(p: Point, size: number, scene: { gridSize: number; grid?: string }): Point {
  const { gridSize } = scene;
  const kind = gridKind(scene);
  if (kind === 'hex-rows' || kind === 'hex-cols') return snapToCell(p, latticeOf(kind, gridSize));
  const offset = Math.round(size) % 2 === 1 ? 0.5 : 0;
  const snap = (v: number) => (Math.round(v / gridSize - offset) + offset) * gridSize;
  return [snap(p[0]), snap(p[1])];
}
