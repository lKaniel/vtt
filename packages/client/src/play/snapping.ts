import { type Body, type Chunk, type DrawnTile, type Point, tileClickable, type Wall } from '@vtt/shared';
import type { TokenView } from '@vtt/system-dnd5e';
import { walkUpPoint } from './map-clicks.ts';

// The pointer snaps to what it is near, as in BG3: a creature, a door or a
// tile that answers clicks. Walking there walks up to it, and a spell or
// attack aimed there goes at its centre.

export type Snap =
  | { kind: 'token'; id: string; name: string; at: Point; r: number }
  | { kind: 'door'; chunk: string; wall: Wall; at: Point }
  | { kind: 'tile'; id: string; at: Point; r: number };

export interface SnapScene {
  /** The creatures this player knows of. */
  tokens: Iterable<TokenView>;
  chunks: ReadonlyMap<string, Chunk>;
  gridSize: number;
  gm: boolean;
}

/** How far past a creature's edge the pointer still snaps to it, in squares. */
const TOKEN_PULL = 0.2;
/** How near a door's middle the pointer snaps to it, in squares. */
const DOOR_PULL = 0.35;
/** Room left between a door and a creature that walks up to it, in pixels. */
const DOOR_GAP = 4;

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const middle = (w: Wall): Point => [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];

interface Near {
  snap: Snap;
  d: number;
}

/** What the pointer at `p` snaps to, if anything: the nearest creature, door or clickable tile. */
export function snapAt(p: Point, scene: SnapScene): Snap | undefined {
  const near = [...nearTokens(p, scene)];
  for (const [chunk, c] of scene.chunks)
    near.push(...nearDoors(p, chunk, c.walls, scene), ...nearTiles(p, c.tiles, scene));
  near.sort((a, b) => a.d - b.d);
  return near[0]?.snap;
}

function nearTokens(p: Point, { tokens, gridSize: g }: SnapScene): Near[] {
  return [...tokens].flatMap((t) => {
    const r = (t.size * g) / 2;
    const d = dist(p, [t.x, t.y]);
    return d <= r + TOKEN_PULL * g ? [{ snap: { kind: 'token', id: t.id, name: t.name, at: [t.x, t.y], r }, d }] : [];
  });
}

function nearDoors(p: Point, chunk: string, walls: readonly Wall[], scene: SnapScene): Near[] {
  const usable = walls.filter((w) => w.door && (scene.gm || !w.secret));
  return usable.flatMap((wall) => {
    const d = dist(p, middle(wall));
    return d <= DOOR_PULL * scene.gridSize ? [{ snap: { kind: 'door', chunk, wall, at: middle(wall) }, d }] : [];
  });
}

function nearTiles(p: Point, tiles: readonly DrawnTile[], scene: SnapScene): Near[] {
  return tiles
    .filter((t) => tileClickable(t, scene.gm) && inTile(t, p))
    .map((t) => {
      const snap = tileSnap(t);
      return { snap, d: dist(p, snap.at) };
    });
}

function inTile(t: DrawnTile, p: Point): boolean {
  return p[0] >= t.x && p[0] <= t.x + t.w && p[1] >= t.y && p[1] <= t.y + t.h;
}

function tileSnap(t: DrawnTile): Snap {
  return { kind: 'tile', id: t.id, at: [t.x + t.w / 2, t.y + t.h / 2], r: Math.min(t.w, t.h) / 2 };
}

/** Where `walker` stands to use what it snapped to: next to a creature or tile, in front of a door on its own side. */
export function interactSpot(walker: Body, snap: Snap, gridSize: number): Point {
  if (snap.kind !== 'door') return walkUpPoint(walker, { x: snap.at[0], y: snap.at[1], r: snap.r });
  const { a, b } = snap.wall;
  const len = dist(a, b) || 1;
  let n: Point = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  const side = (walker.x - snap.at[0]) * n[0] + (walker.y - snap.at[1]) * n[1];
  if (side < 0) n = [-n[0], -n[1]];
  const off = Math.min(walker.r, gridSize / 2) + DOOR_GAP;
  return [snap.at[0] + n[0] * off, snap.at[1] + n[1] * off];
}
