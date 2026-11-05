import { type Point, tokenLevel, type WorldInfo } from '@vtt/shared';
import type { TokenView } from '@vtt/system-dnd5e';
import { portraitOf } from '../icon-art.ts';
import { onShownFloor, type Table3D } from './content3d.ts';
import { standAt } from './flight3d.ts';
import type { Standing } from './scene3d.ts';

// The creatures the 3D view stands as pictures (those with a figure stand
// as models, content3d.ts): each on its own floor, on what is under it, or
// in the air when its elevation keeps it well above that (flight3d.ts).

/** The level a creature stands on. */
export function levelOf(levels: WorldInfo['levels'], t: Parameters<typeof tokenLevel>[1]) {
  const id = tokenLevel(levels, t);
  return levels?.find((l) => l.id === id);
}

/** What standing creatures needs of the 3D view. */
export interface StandContext {
  table: Table3D;
  /** The floor shown, pixels up. */
  floor: number;
  /** Pixels per foot, and per square. */
  px: number;
  grid: number;
  /** Where the 2D map has a creature now. */
  placeOf(id: string): { at: Point } | undefined;
  /** The surface under a creature whose feet are at `feet` (surface3d.ts). */
  under(id: string, at: Point, feet: number): number | undefined;
}

/** How far above what is under it a creature still stands on it rather than flies, feet. */
const STEP = 6;

/** The creatures you see on the floors shown (but those with a figure), where the 2D map has them now. */
export function standingOf(tokens: Iterable<TokenView>, c: StandContext): Standing[] {
  const out: Standing[] = [];
  for (const t of tokens) {
    const place = c.placeOf(t.id);
    if (!place || t.model || !onShownFloor(t, c.table)) continue;
    // On its own floor, wherever the floor shown is.
    const bottom = levelOf(c.table.world.levels, t)?.bottom;
    const feet = Math.max(t.elevation ?? 0, bottom ?? -Infinity) * c.px;
    const stand = standAt(feet, c.under(t.id, place.at, feet) ?? (bottom ?? 0) * c.px, STEP * c.px);
    out.push({
      id: t.id,
      at: place.at,
      height: stand.feet - c.floor,
      ...(stand.ground !== undefined && { ground: stand.ground - c.floor }),
      size: t.size * c.grid,
      picture: portraitOf(t),
      faint: t.hidden,
    });
  }
  return out;
}
