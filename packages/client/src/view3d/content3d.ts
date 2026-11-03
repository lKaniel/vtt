import { type DrawnTile, onLevels, type Point, tokenLevel, type WorldInfo } from '@vtt/shared';
import type { TokenView } from '@vtt/system-dnd5e';
import type { ModelShown } from './models3d.ts';

// What the 3D view stands up from the table: the tiles that carry a model,
// and the creatures with a figure (see model3d.ts in shared), on the floors
// shown and, for a player, where they have explored.

/** The table as the 3D view reads it. */
export interface Table3D {
  world: WorldInfo;
  /** The levels drawn (bottom first); undefined = every level. */
  shown?: string[];
  /** For a player with fog of war: whether a map point has been seen. */
  explored?: (p: Point) => boolean;
}

/** The model tiles to stand. */
export function tileModels(tiles: Iterable<DrawnTile>, table: Table3D): ModelShown[] {
  const out: ModelShown[] = [];
  for (const t of tiles) {
    if (t.kind !== 'image' || !t.model || !onLevels(t, table.shown)) continue;
    if (table.explored && !table.explored([t.x + t.w / 2, t.y + t.h / 2])) continue;
    out.push({
      key: `tile:${t.id}:${JSON.stringify(t.model)}`,
      rect: { x: t.x, y: t.y, w: t.w, h: t.h },
      model: t.model,
    });
  }
  return out;
}

/** The creatures standing as figures, each over its square where the map has it now. */
export function figures(
  tokens: Iterable<TokenView>,
  table: Table3D,
  placeOf: (id: string) => { at: Point } | undefined,
): ModelShown[] {
  const grid = table.world.gridSize;
  const out: ModelShown[] = [];
  for (const t of tokens) {
    const place = t.model && onShownFloor(t, table) ? placeOf(t.id) : undefined;
    if (!t.model || !place) continue;
    const side = t.size * grid * (t.scale ?? 1);
    const rect = { x: place.at[0] - side / 2, y: place.at[1] - side / 2, w: side, h: side };
    out.push({ key: `token:${t.id}:${t.model.src}`, rect, model: { ...t.model, elevation: t.elevation ?? 0 } });
  }
  return out;
}

/** Whether a creature stands on one of the floors shown. */
export function onShownFloor(t: TokenView, table: Table3D): boolean {
  return !table.shown || table.shown.includes(tokenLevel(table.world.levels, t) ?? '');
}
