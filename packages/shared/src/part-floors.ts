import type { SceneLevel } from './schema.ts';

// A part of a combined scene (scene-parts.ts) may name its floors otherwise
// than the whole scene does: a quarter built by itself with "f0" and "f1",
// laid on a city with "ground" and "upper". Each floor of the part is mapped
// onto one of the whole's: the one with its id, else its name, else the one
// its bottom lies in (else the nearest). Its tiles, walls, lights and the
// rest are laid on the whole on those floors, and saved back on its own.

/** A part's floor ids → the whole scene's they are played on; only kept when some differ. */
export type PartFloors = Readonly<Record<string, string>>;

type Level = Pick<SceneLevel, 'id' | 'name' | 'bottom' | 'top'>;

/** How the floors of a part map onto those of the whole scene; undefined when they need no map. */
export function partFloors(
  part: readonly Level[] | undefined,
  whole: readonly Level[] | undefined,
): PartFloors | undefined {
  if (!part?.length || !whole?.length) return undefined;
  const floors = Object.fromEntries(part.map((l) => [l.id, wholeFloor(l, whole).id]));
  return part.every((l) => floors[l.id] === l.id) ? undefined : floors;
}

const named = (name: string) => name.trim().toLowerCase();

function wholeFloor(level: Level, whole: readonly Level[]): Level {
  const same = whole.find((w) => w.id === level.id) ?? whole.find((w) => named(w.name) === named(level.name));
  if (same) return same;
  const bottom = [...whole].sort((a, b) => a.bottom - b.bottom);
  const within = bottom.find((w, i) => {
    const top = w.top ?? bottom[i + 1]?.bottom ?? Infinity;
    return level.bottom >= w.bottom && level.bottom < top;
  });
  const gap = (w: Level) => Math.abs(w.bottom - level.bottom);
  return within ?? bottom.reduce((best, w) => (gap(w) < gap(best) ? w : best), bottom[0]!);
}

interface OnFloors {
  level?: unknown;
  levels?: unknown;
}

const unfloored = (item: OnFloors) => item.level === undefined && item.levels === undefined;

function renamed<T extends object>(item: T, name: (id: string) => string): T {
  const { level, levels } = item as OnFloors;
  const out: OnFloors = { ...item };
  if (typeof level === 'string') out.level = name(level);
  if (Array.isArray(levels)) out.levels = [...new Set((levels as string[]).map(name))];
  return out as T;
}

/** A part's item on the whole scene's floors. */
export function floorsOnWhole<T extends object>(item: T, floors: PartFloors | undefined): T {
  if (!floors || unfloored(item)) return item;
  return renamed(item, (id) => floors[id] ?? id);
}

/** An item of the whole scene back on its part's floors: a whole floor goes to the first of the part's laid on it. */
export function floorsHome<T extends object>(item: T, floors: PartFloors | undefined): T {
  if (!floors || unfloored(item)) return item;
  const home = (id: string) => (floors[id] === id ? id : (Object.keys(floors).find((k) => floors[k] === id) ?? id));
  return renamed(item, home);
}
