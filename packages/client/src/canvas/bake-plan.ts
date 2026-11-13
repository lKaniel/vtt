import { type Chunk, levelRank, type Rect, type SceneLevel } from '@vtt/shared';
import { overlaps, tileBounds, tilePad } from './tile-bake.ts';
import { tileMedia } from './tile-motion.ts';

// Which tiles an optimised scene draws into its picture (scene-bake.ts in
// shared): the still ones, one picture per floor. A tile whose look depends
// on the game stays live: roofs (they fade), doors, triggers, objects, tiles
// hidden from players, videos, GIFs and scrolling pictures. A picture lies
// under every live tile of its floor, so a still tile is baked only when
// nothing drawn under it stays out of its picture (a live tile, or another
// floor's picture); otherwise it stays live too, keeping the draw order.

type ChunkTile = Chunk['tiles'][number];

/** Whether a tile looks the same whatever happens in the game. */
export function bakeable(tile: ChunkTile): boolean {
  if (tile.hidden || tile.trigger || tile.description) return false;
  if (tile.kind !== 'image') return true;
  return !tile.overhead && !tile.scroll && !tile.door && tileMedia(tile.src) === 'image';
}

/** The floor whose picture a tile goes in: its one level, '' for every floor, undefined for several (live). */
export function bakeGroupOf(tile: ChunkTile): string | undefined {
  const levels = new Set([...(tile.level ? [tile.level] : []), ...(tile.levels ?? [])]);
  if (levels.size > 1) return undefined;
  return [...levels][0] ?? '';
}

/** One floor's picture: the tiles in it, bottom first, and what they cover. */
export interface PlannedGroup {
  level?: string;
  tiles: ChunkTile[];
  bounds: Rect;
}

interface Placed {
  bounds: Rect;
  /** The picture it is in; undefined: live. */
  group?: string;
}

/** Cells the blockers are filed in, to look only at those near a tile. */
const CELL = 1024;

class Blockers {
  private cells = new Map<string, Placed[]>();

  private *keys(r: Rect): Generator<string> {
    for (let y = Math.floor(r.y / CELL); y < Math.ceil((r.y + r.h) / CELL); y++)
      for (let x = Math.floor(r.x / CELL); x < Math.ceil((r.x + r.w) / CELL); x++) yield `${x}_${y}`;
  }

  add(p: Placed): void {
    for (const key of this.keys(p.bounds)) this.cells.set(key, [...(this.cells.get(key) ?? []), p]);
  }

  /** Whether something drawn earlier that isn't in picture `group` lies under `r`. */
  blocks(r: Rect, group: string): boolean {
    for (const key of this.keys(r))
      for (const p of this.cells.get(key) ?? []) if (p.group !== group && overlaps(p.bounds, r)) return true;
    return false;
  }
}

const union = (a: Rect, b: Rect): Rect => {
  const [x, y] = [Math.min(a.x, b.x), Math.min(a.y, b.y)];
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/** The pictures to bake, one per floor with anything in it, from the scene's tiles in draw order. */
export function bakePlan(tiles: readonly ChunkTile[], levels: readonly SceneLevel[] | undefined): PlannedGroup[] {
  const rank = (t: ChunkTile) => {
    const own = [...(t.level ? [t.level] : []), ...(t.levels ?? [])];
    return own.length ? Math.min(...own.map((l) => levelRank(levels, l))) : 0;
  };
  const sorted = tiles
    .map((t, i) => ({ t, i, r: rank(t) }))
    .sort((a, b) => a.r - b.r || (a.t.z ?? a.i) - (b.t.z ?? b.i) || a.i - b.i);
  const blockers = new Blockers();
  const groups = new Map<string, PlannedGroup>();
  for (const { t } of sorted) {
    const bounds = tileBounds(t, tilePad(t));
    const group = bakeable(t) ? bakeGroupOf(t) : undefined;
    const baked = group !== undefined && !blockers.blocks(bounds, group);
    blockers.add({ bounds, ...(baked && { group }) });
    if (!baked) continue;
    const found = groups.get(group);
    if (found) {
      found.tiles.push(t);
      found.bounds = union(found.bounds, bounds);
    } else groups.set(group, { ...(group && { level: group }), tiles: [t], bounds });
  }
  return [...groups.values()];
}

/** JSON with its keys in order, so the same tile always reads the same. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    return `{${entries
      .toSorted(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** A short mark of how a tile looks (everything but its place in the draw order), to tell when it changed since the bake. */
export function tilePrint(tile: ChunkTile): string {
  const { z: _z, ...look } = tile;
  const text = stable(look);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
