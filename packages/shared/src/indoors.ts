import { segmentsIntersect } from './geometry.ts';
import { rectBetween } from './hit-test.ts';
import { tilesOnFloor } from './floor-tiles.ts';
import { levelsSeen, onLevel } from './levels.ts';
import type { Rect } from './chunks.ts';
import type { Chunk, Point, SceneLevel, Wall } from './schema.ts';
import { restriction, wallsAt } from './walls.ts';

// Indoors: ground under a roof and closed in by walls, where the light of
// the sky (the scene's darkness, the time of day) never reaches, so only
// lamps and senses show anything. The map is cut into half squares; those
// under a roof that no gap (a missing wall, an open door, a window) joins
// to open ground are indoors.

/** Half squares under roofs, marked 1 where they are indoors. */
export interface Indoors {
  cell: number;
  x0: number;
  y0: number;
  cols: number;
  rows: number;
  inside: Uint8Array;
}

/** A roof: a picture's rectangle, turned `rotation` degrees about its centre. */
export interface RoofRect {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

/** Walls are stretched this far at each end, so tiny gaps where two meet let no sky in. */
const MEND = 2;

function underRoof(r: RoofRect, [px, py]: Point): boolean {
  const [cx, cy] = [r.x + r.w / 2, r.y + r.h / 2];
  const a = (-(r.rotation ?? 0) * Math.PI) / 180;
  const [dx, dy] = [px - cx, py - cy];
  const x = dx * Math.cos(a) - dy * Math.sin(a);
  const y = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(x) <= r.w / 2 && Math.abs(y) <= r.h / 2;
}

/** The map rectangle a roof covers, turned or not. */
function roofBounds(r: RoofRect): Rect {
  const a = ((r.rotation ?? 0) * Math.PI) / 180;
  const w = Math.abs(r.w * Math.cos(a)) + Math.abs(r.h * Math.sin(a));
  const h = Math.abs(r.w * Math.sin(a)) + Math.abs(r.h * Math.cos(a));
  return { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h };
}

function mended(w: Wall): [Point, Point] {
  const [dx, dy] = [w.b[0] - w.a[0], w.b[1] - w.a[1]];
  const len = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [(dx / len) * MEND, (dy / len) * MEND];
  return [
    [w.a[0] - ux, w.a[1] - uy],
    [w.b[0] + ux, w.b[1] + uy],
  ];
}

class Cells {
  readonly area: Indoors;
  /** Which roofs cover each cell: 1 under one. */
  readonly roofed: Uint8Array;
  /** The walls near each cell. */
  private near: [Point, Point][][];

  constructor(roofs: readonly RoofRect[], cell: number) {
    const boxes = roofs.map(roofBounds);
    const x0 = Math.floor(Math.min(...boxes.map((b) => b.x)) / cell) * cell - cell;
    const y0 = Math.floor(Math.min(...boxes.map((b) => b.y)) / cell) * cell - cell;
    const cols = Math.ceil((Math.max(...boxes.map((b) => b.x + b.w)) - x0) / cell) + 1;
    const rows = Math.ceil((Math.max(...boxes.map((b) => b.y + b.h)) - y0) / cell) + 1;
    this.area = { cell, x0, y0, cols, rows, inside: new Uint8Array(cols * rows) };
    this.roofed = new Uint8Array(cols * rows);
    this.near = Array.from({ length: cols * rows }, () => []);
    roofs.forEach((r, i) => this.cover(r, boxes[i]!));
  }

  centre(i: number): Point {
    const { cell, x0, y0, cols } = this.area;
    return [x0 + ((i % cols) + 0.5) * cell, y0 + (Math.floor(i / cols) + 0.5) * cell];
  }

  /** The cells a rectangle touches, as [first col, first row, last col, last row], clamped. */
  span(b: Rect): [number, number, number, number] {
    const { cell, x0, y0, cols, rows } = this.area;
    const clamp = (v: number, n: number) => Math.min(n - 1, Math.max(0, v));
    return [
      clamp(Math.floor((b.x - x0) / cell), cols),
      clamp(Math.floor((b.y - y0) / cell), rows),
      clamp(Math.floor((b.x + b.w - x0) / cell), cols),
      clamp(Math.floor((b.y + b.h - y0) / cell), rows),
    ];
  }

  private cover(r: RoofRect, b: Rect): void {
    const [c0, r0, c1, r1] = this.span(b);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const i = row * this.area.cols + col;
        if (underRoof(r, this.centre(i))) this.roofed[i] = 1;
      }
    }
  }

  addWall(w: Wall): void {
    const seg = mended(w);
    const [c0, r0, c1, r1] = this.span(rectBetween(...seg));
    for (let row = r0; row <= r1; row++)
      for (let col = c0; col <= c1; col++) this.near[row * this.area.cols + col]!.push(seg);
  }

  /** Whether nothing stands between the centres of two neighbouring cells. */
  open(i: number, j: number): boolean {
    const [p, q] = [this.centre(i), this.centre(j)];
    const crosses = (s: [Point, Point]) => segmentsIntersect(p, q, s[0], s[1]);
    return !this.near[i]!.some(crosses) && !this.near[j]!.some(crosses);
  }

  neighbours(i: number): number[] {
    const { cols, rows } = this.area;
    const [col, row] = [i % cols, Math.floor(i / cols)];
    const out: number[] = [];
    if (col > 0) out.push(i - 1);
    if (col < cols - 1) out.push(i + 1);
    if (row > 0) out.push(i - cols);
    if (row < rows - 1) out.push(i + cols);
    return out;
  }

  /** Whether a cell lies on the edge of the grid, where open ground begins. */
  edge(i: number): boolean {
    const { cols, rows } = this.area;
    const [col, row] = [i % cols, Math.floor(i / cols)];
    return col === 0 || row === 0 || col === cols - 1 || row === rows - 1;
  }
}

/** The roofed cells joined to `start` with nothing between them, and whether the sky gets in. */
function room(cells: Cells, start: number, seen: Uint8Array): { members: number[]; open: boolean } {
  const members = [start];
  seen[start] = 1;
  let open = false;
  // The list grows as the room is walked; for-of goes on to the cells added.
  for (const i of members) {
    if (cells.edge(i)) open = true;
    for (const j of cells.neighbours(i)) {
      if (seen[j] || !cells.open(i, j)) continue;
      if (!cells.roofed[j]) {
        open = true;
        continue;
      }
      seen[j] = 1;
      members.push(j);
    }
  }
  return { members, open };
}

/** The ground under `roofs` that `walls` close in, on a grid of half squares; undefined with no roofs. */
export function indoorArea(walls: readonly Wall[], roofs: readonly RoofRect[], gridSize: number): Indoors | undefined {
  if (!roofs.length) return undefined;
  const cells = new Cells(roofs, gridSize / 2);
  for (const w of walls) if (restriction(w, 'light') !== 'none') cells.addWall(w);
  markRooms(cells);
  return cells.area;
}

/** Marks the cells of every room the sky can't get into as inside. */
function markRooms(cells: Cells): void {
  const seen = new Uint8Array(cells.roofed.length);
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] || !cells.roofed[i]) continue;
    const { members, open } = room(cells, i, seen);
    if (!open) for (const m of members) cells.area.inside[m] = 1;
  }
}

/** Whether map point `p` is indoors. */
export function isIndoors(area: Indoors | undefined, [x, y]: Point): boolean {
  if (!area) return false;
  const col = Math.floor((x - area.x0) / area.cell);
  const row = Math.floor((y - area.y0) / area.cell);
  if (col < 0 || row < 0 || col >= area.cols || row >= area.rows) return false;
  return area.inside[row * area.cols + col] === 1;
}

/** The indoors as rectangles, a run of cells along a row each, for drawing. */
export function indoorRects(area: Indoors | undefined): Rect[] {
  if (!area) return [];
  const out: Rect[] = [];
  for (let row = 0; row < area.rows; row++) out.push(...rowRuns(area, row));
  return out;
}

function rowRuns({ cell, x0, y0, cols, inside }: Indoors, row: number): Rect[] {
  const out: Rect[] = [];
  let start = -1;
  for (let col = 0; col <= cols; col++) {
    const on = col < cols && inside[row * cols + col] === 1;
    if (on && start < 0) start = col;
    if (on || start < 0) continue;
    out.push({ x: x0 + start * cell, y: y0 + row * cell, w: (col - start) * cell, h: cell });
    start = -1;
  }
  return out;
}

type Tile = Chunk['tiles'][number];

/** The roofs over a creature on `level`: overhead pictures and the floors above, as the map draws them. */
export function roofsOn(
  tiles: readonly Tile[],
  levels: readonly SceneLevel[] | undefined,
  level: string | undefined,
): RoofRect[] {
  const drawn = tilesOnFloor(tiles, levels, levelsSeen(levels, level), level);
  return drawn.filter((t) => t.kind === 'image' && t.overhead && !t.hidden);
}

/** The indoors of floor `level` (none: a scene without floors): its roofs, and its walls standing at its floor. */
export function indoorsOn(
  { tiles, walls }: { tiles: readonly Tile[]; walls: readonly Wall[] },
  levels: readonly SceneLevel[] | undefined,
  level: string | undefined,
  gridSize: number,
): Indoors | undefined {
  const bottom = levels?.find((l) => l.id === level)?.bottom ?? 0;
  const standing = wallsAt(walls, bottom).filter((w) => onLevel(w, level));
  return indoorArea(standing, roofsOn(tiles, levels, level), gridSize);
}
