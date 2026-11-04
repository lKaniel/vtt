import type { SceneLevel, Wall } from './schema.ts';
import { wallsAt } from './walls.ts';

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

/** What a map item says about its floors: one `level`, several `levels`, or neither (every level). */
export interface OnLevels {
  level?: string;
  levels?: readonly string[];
}

/** Whether an item shows (and blocks) on `level`: items without one are on every level, and so is everything when no level is picked. */
export function onLevel(item: OnLevels, level: string | undefined): boolean {
  if (!level || (!item.level && !item.levels?.length)) return true;
  return item.level === level || !!item.levels?.includes(level);
}

/** Whether an item is on any of `shown` (undefined: no level picked, so everything shows). */
export function onLevels(item: OnLevels, shown: readonly string[] | undefined): boolean {
  return !shown || shown.some((l) => onLevel(item, l));
}

/** The levels a viewer on `level` sees: its own and those it `sees`, bottom first; undefined when none is picked. */
export function levelsSeen(levels: readonly SceneLevel[] | undefined, level: string | undefined): string[] | undefined {
  const own = levels?.find((l) => l.id === level);
  if (!own) return undefined;
  const ids = new Set([own.id, ...(own.sees ?? [])]);
  return [...(levels ?? [])]
    .filter((l) => ids.has(l.id))
    .sort((a, b) => a.bottom - b.bottom)
    .map((l) => l.id);
}

/** Where a level draws among those seen: lower floors under higher ones. */
export function levelRank(levels: readonly SceneLevel[] | undefined, level: string | undefined): number {
  const sorted = [...(levels ?? [])].sort((a, b) => a.bottom - b.bottom);
  return Math.max(
    0,
    sorted.findIndex((l) => l.id === level),
  );
}

/** The floors an elevator serving `floors` (missing: every one) can take a token on `from` to, bottom first. */
export function levelChoices(
  levels: readonly SceneLevel[] | undefined,
  floors: readonly string[] | undefined,
  from: string | undefined,
): SceneLevel[] {
  return [...(levels ?? [])]
    .filter((l) => l.id !== from && (!floors?.length || floors.includes(l.id)))
    .sort((a, b) => a.bottom - b.bottom);
}

/** Where a creature stands: its elevation in feet (none: on the ground, 0). */
export interface Standing {
  elevation?: number;
}

/**
 * The walls that stop a creature: those on its own floor (and on every
 * floor) that stand at its elevation. A creature without one stands at 0 ft,
 * so the walls of the floors above never get in its way.
 */
export function wallsOnFloor<W extends Pick<Wall, 'height'> & OnLevels>(
  walls: readonly W[],
  levels: readonly SceneLevel[] | undefined,
  creature: Standing,
): W[] {
  const level = tokenLevel(levels, creature);
  return wallsAt(walls, creature.elevation ?? 0).filter((w) => onLevel(w, level));
}

/** Whether two creatures stand on the same floor (always, on a scene without levels). */
export function sameFloor(levels: readonly SceneLevel[] | undefined, a: Standing, b: Standing): boolean {
  return tokenLevel(levels, a) === tokenLevel(levels, b);
}

/** The floor just below `level`, where something falling through a hole lands; none under the lowest. */
export function levelBelow(
  levels: readonly SceneLevel[] | undefined,
  level: string | undefined,
): SceneLevel | undefined {
  const sorted = [...(levels ?? [])].sort((a, b) => a.bottom - b.bottom);
  const at = sorted.findIndex((l) => l.id === level);
  return at > 0 ? sorted[at - 1] : undefined;
}

/**
 * Whether something with a darkness band works now. A band written high to
 * low wraps round: [0.8, 0.2] is dusk to dawn. The game clock (a later step)
 * sets the darkness, so this is the one place time of day is read.
 */
/** Whether a placed light shines now: not put out, and in its darkness band. */
export function lightShines(light: { hidden?: boolean; activeAt?: [number, number] }, darkness: number): boolean {
  return !light.hidden && activeAt(light.activeAt, darkness);
}

export function activeAt(band: readonly [number, number] | undefined, darkness: number): boolean {
  if (!band) return true;
  const [from, to] = band;
  return from <= to ? darkness >= from && darkness <= to : darkness >= from || darkness <= to;
}
