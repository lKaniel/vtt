import type { SceneLevel } from './schema.ts';

// Scene levels, like Foundry's Levels module: a scene names its floors as
// elevation bands, map items say which floor they are on, and a token is on
// the floor its elevation reaches. A viewer sees and is blocked by what is
// on their own floor, plus what is on every floor (items that name none).

/** The level an elevation (feet) is on: the highest whose bottom it reaches; below them all, the lowest. */
export function levelAt(levels: readonly SceneLevel[] | undefined, elevation: number): SceneLevel | undefined {
  const sorted = [...(levels ?? [])].sort((a, b) => a.bottom - b.bottom);
  return sorted.filter((l) => l.bottom <= elevation).at(-1) ?? sorted[0];
}

/** The level id a token stands on, by its elevation (0 when it has none); undefined on a scene without levels. */
export function tokenLevel(
  levels: readonly SceneLevel[] | undefined,
  token: { elevation?: number },
): string | undefined {
  return levelAt(levels, token.elevation ?? 0)?.id;
}

/** Whether an item shows (and blocks) on `level`: items without one are on every level, and so is everything when no level is picked. */
export function onLevel(item: { level?: string }, level: string | undefined): boolean {
  return !item.level || !level || item.level === level;
}

/**
 * Whether something with a darkness band works now. A band written high to
 * low wraps round: [0.8, 0.2] is dusk to dawn. The game clock (a later step)
 * sets the darkness, so this is the one place time of day is read.
 */
export function activeAt(band: readonly [number, number] | undefined, darkness: number): boolean {
  if (!band) return true;
  const [from, to] = band;
  return from <= to ? darkness >= from && darkness <= to : darkness >= from || darkness <= to;
}
