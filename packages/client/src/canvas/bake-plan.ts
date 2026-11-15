import { type Chunk, levelRank, type Rect, type SceneLevel, tilesOnFloor } from '@vtt/shared';
import { overlaps, tileBounds, tilePad } from './tile-bake.ts';
import { tileMedia } from './tile-motion.ts';

// Which tiles an optimised scene draws into its pictures (scene-bake.ts in
// shared): the still ones, one picture per floor, and one more per floor for
// its roofs (`overhead`), which fade as one. A tile whose look depends on
// the game stays live: doors, triggers, objects, tiles hidden from players,
// videos, GIFs and scrolling pictures. A floor's picture lies under every
// live tile of its floor, so a still tile is baked only when nothing drawn
// under it stays out of its picture (a live tile, or another floor's
// picture); a roof picture lies over its floor's roofs, so a roof is baked
// only when nothing live is drawn over it. Otherwise the tile stays live
// too, keeping the draw order.

type ChunkTile = Chunk['tiles'][number];

/** Whether a tile looks the same whatever happens in the game. */
export function bakeable(tile: ChunkTile): boolean {
  if (tile.hidden || tile.trigger || tile.description) return false;
  if (tile.kind !== 'image') return true;
  return !tile.scroll && !tile.door && tileMedia(tile.src) === 'image';
}

const isRoof = (tile: ChunkTile): boolean => tile.kind === 'image' && !!tile.overhead;
const floorsOf = (tile: ChunkTile): string[] => [
  ...new Set([...(tile.level ? [tile.level] : []), ...(tile.levels ?? [])]),
];

/** The floor whose picture a tile goes in: its one level, '' for every floor, undefined for several (live). */
export function bakeGroupOf(tile: ChunkTile): string | undefined {
  const levels = floorsOf(tile);
  return levels.length > 1 ? undefined : (levels[0] ?? '');
}

/** One floor's picture (or its roofs'): the tiles in it, bottom first, and what they cover. */
export interface PlannedGroup {
  level?: string;
  roof?: true;
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

class Groups {
  private found = new Map<string, PlannedGroup>();

  constructor(private readonly roof: boolean) {}

  add(level: string, tile: ChunkTile, bounds: Rect): void {
    const group = this.found.get(level);
    if (group) {
      group.tiles.push(tile);
      group.bounds = union(group.bounds, bounds);
    } else
      this.found.set(level, {
        ...(level && { level }),
        ...(this.roof && { roof: true as const }),
        tiles: [tile],
        bounds,
      });
  }

  get list(): PlannedGroup[] {
    return [...this.found.values()];
  }
}

const boundsOf = (t: ChunkTile): Rect => tileBounds(t, tilePad(t));

/** The floor pictures: each still tile, unless something out of its picture lies under it. */
function floorPlan(sorted: readonly ChunkTile[]): PlannedGroup[] {
  const blockers = new Blockers();
  const groups = new Groups(false);
  for (const t of sorted) {
    // A roof over every floor never lies on the ground.
    if (isRoof(t) && !floorsOf(t).length) continue;
    const bounds = boundsOf(t);
    const group = bakeable(t) && !isRoof(t) ? bakeGroupOf(t) : undefined;
    const baked = group !== undefined && !blockers.blocks(bounds, group);
    blockers.add({ bounds, ...(baked && { group }) });
    if (baked) groups.add(group, t, bounds);
  }
  return groups.list;
}

/**
 * The roof pictures: each still roof, unless something out of its picture
 * is drawn over it. Seen from below, every tile of a floor is a roof, so a
 * floor's tiles count; the roofs with no floor only have each other.
 */
function roofPlan(sorted: readonly ChunkTile[]): PlannedGroup[] {
  const over = new Map<string, Blockers>();
  const stack = (floor: string) => over.get(floor) ?? over.set(floor, new Blockers()).get(floor)!;
  const groups = new Groups(true);
  for (const t of sorted.toReversed()) {
    const floors = floorsOf(t);
    const stacks = floors.length || !isRoof(t) ? floors : [''];
    const bounds = boundsOf(t);
    const group = roofGroupOf(t);
    const baked = group !== undefined && !stack(group).blocks(bounds, group);
    for (const floor of stacks) stack(floor).add({ bounds, ...(baked && { group }) });
    if (baked) groups.add(group, t, bounds);
  }
  for (const g of groups.list) g.tiles.reverse();
  return groups.list;
}

/** The roof picture a tile goes in: a still roof's floor ('' for none); undefined: no roof, or live. */
const roofGroupOf = (t: ChunkTile): string | undefined => (isRoof(t) && bakeable(t) ? bakeGroupOf(t) : undefined);

/** The pictures to bake, one per floor with anything in it and one per floor with roofs, from the scene's tiles in draw order. */
export function bakePlan(tiles: readonly ChunkTile[], levels: readonly SceneLevel[] | undefined): PlannedGroup[] {
  const rank = (t: ChunkTile) => {
    const own = floorsOf(t);
    return own.length ? Math.min(...own.map((l) => levelRank(levels, l))) : 0;
  };
  const sorted = tiles
    .map((t, i) => ({ t, i, r: rank(t) }))
    .sort((a, b) => a.r - b.r || (a.t.z ?? a.i) - (b.t.z ?? b.i) || a.i - b.i)
    .map(({ t }) => t);
  return [...floorPlan(sorted), ...roofPlan(sorted)];
}

/** The floors the map shows, as `tilesOnFloor` takes them. */
export interface FloorsShown {
  levels: readonly SceneLevel[] | undefined;
  shown: readonly string[] | undefined;
  current: string | undefined;
}

/** A scene has fewer tiles than this, so its roof picture lies over them all (and under the next part's). */
const OVER_ALL = 999_999.5;

/**
 * Where a picture goes on the map as the floor shown sees it: with the
 * roofs or on the ground, and its place in their draw order (`base`: where
 * its scene's tiles start). Undefined when its tiles are drawn the other
 * way there (a floor seen from below is roofs, a floor's roofs seen from it
 * lie flat): they no longer match the picture and are drawn as tiles.
 */
export function bakePlace(
  group: { level?: string; roof?: boolean },
  base: number,
  { levels, shown, current }: FloorsShown,
): { roof: boolean; z: number } | undefined {
  const roof = !!group.roof;
  const probe = {
    ...{ kind: 'image', id: 'bake', src: '', x: 0, y: 0, w: 1, h: 1 },
    z: base + (roof ? OVER_ALL : -0.5),
    ...(group.level && { level: group.level }),
    ...(roof && { overhead: true }),
  } as ChunkTile;
  const [placed] = tilesOnFloor([probe], levels, shown, current);
  if (!placed || isRoof(placed) !== roof) return undefined;
  return { roof, z: placed.z! };
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
