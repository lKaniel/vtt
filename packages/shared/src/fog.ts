import type { Point } from './schema.ts';
import type { Senses } from './senses.ts';
import { feetToPx, type LightSource } from './vision.ts';
import { lightReach } from './light-shape.ts';
import type { ReachPolygon } from './walls.ts';

// Explored fog of war: where a player's tokens have seen, as a bitmap of
// small cells (a quarter of a square each), cut into blocks so only what
// changed is saved and sent. The server works it out from the same sight
// polygons the client draws; it is plain geometry with no game state, kept
// together with vision.ts behind the boundary a faster engine may replace.

/** Cells along a block's side. */
export const FOG_BLOCK = 64;
/** Fog cells along a square's side. */
export const FOG_PER_SQUARE = 4;
/** How far a token sees when nothing blocks it and it is light, in squares. */
export const SIGHT_SQUARES = 40;

/** Bytes in one block's bits. */
export const FOG_BYTES = (FOG_BLOCK * FOG_BLOCK) / 8;
const BYTES = FOG_BYTES;

/** The side of a fog cell for a scene's grid, in pixels. */
export function fogCell(gridSize: number): number {
  return gridSize / FOG_PER_SQUARE;
}

/** Cells set in a box of the cell grid: `bits` has one byte per cell, row by row. */
export interface Raster {
  x0: number;
  y0: number;
  w: number;
  h: number;
  bits: Uint8Array;
}

function emptyRaster(x0: number, y0: number, w: number, h: number): Raster {
  return { x0, y0, w: Math.max(0, w), h: Math.max(0, h), bits: new Uint8Array(Math.max(0, w) * Math.max(0, h)) };
}

function bounds(poly: readonly number[]): { x0: number; y0: number; x1: number; y1: number } {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < poly.length; i += 2) {
    x0 = Math.min(x0, poly[i]!);
    x1 = Math.max(x1, poly[i]!);
    y0 = Math.min(y0, poly[i + 1]!);
    y1 = Math.max(y1, poly[i + 1]!);
  }
  return { x0, y0, x1, y1 };
}

/** Where the edges of `poly` cross the line at height `y`, left to right. */
function crossings(poly: readonly number[], y: number): number[] {
  const xs: number[] = [];
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [poly[i]!, poly[i + 1]!, poly[j]!, poly[j + 1]!];
    if (yi > y !== yj > y) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
  }
  return xs.sort((a, b) => a - b);
}

/** The cells whose centres lie inside a polygon (flat x0, y0, x1, y1, ...), by scanlines. */
export function rasterize(poly: readonly number[], cell: number): Raster {
  if (poly.length < 6) return emptyRaster(0, 0, 0, 0);
  const b = bounds(poly);
  const x0 = Math.floor(b.x0 / cell);
  const y0 = Math.floor(b.y0 / cell);
  const out = emptyRaster(x0, y0, Math.ceil(b.x1 / cell) - x0, Math.ceil(b.y1 / cell) - y0);
  for (let row = 0; row < out.h; row++) {
    const xs = crossings(poly, (y0 + row + 0.5) * cell);
    for (let k = 0; k + 1 < xs.length; k += 2) fillSpan(out, row, xs[k]! / cell - 0.5, xs[k + 1]! / cell - 0.5);
  }
  return out;
}

/** Sets the cells of `row` whose centres fall between a and b (in cell units, centre-relative). */
function fillSpan(r: Raster, row: number, a: number, b: number): void {
  const from = Math.max(0, Math.ceil(a) - r.x0);
  const to = Math.min(r.w - 1, Math.floor(b) - r.x0);
  for (let i = from; i <= to; i++) r.bits[row * r.w + i] = 1;
}

/** A round brush: the cells within `radius` of `center`. */
export function rasterCircle(center: Point, radius: number, cell: number): Raster {
  const ring: number[] = [];
  const steps = 48;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push(center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius);
  }
  return rasterize(ring, cell);
}

/** A brush dragged through `path`: every stamp at once, as one raster. */
export function rasterStroke(path: readonly Point[], radius: number, cell: number): Raster {
  const stamps = path.map((p) => rasterCircle(p, radius, cell));
  const x0 = Math.min(...stamps.map((r) => r.x0));
  const y0 = Math.min(...stamps.map((r) => r.y0));
  const x1 = Math.max(...stamps.map((r) => r.x0 + r.w));
  const y1 = Math.max(...stamps.map((r) => r.y0 + r.h));
  const out = emptyRaster(x0, y0, x1 - x0, y1 - y0);
  for (const r of stamps) stampInto(out, r);
  return out;
}

/** Sets in `out` every cell set in `r` (which lies inside it). */
function stampInto(out: Raster, r: Raster): void {
  for (let row = 0; row < r.h; row++) {
    for (let col = 0; col < r.w; col++) {
      if (r.bits[row * r.w + col]) out.bits[(r.y0 + row - out.y0) * out.w + (r.x0 + col - out.x0)] = 1;
    }
  }
}

/** The cells set in both. */
function intersect(a: Raster, b: Raster): Raster {
  const x0 = Math.max(a.x0, b.x0);
  const y0 = Math.max(a.y0, b.y0);
  const out = emptyRaster(x0, y0, Math.min(a.x0 + a.w, b.x0 + b.w) - x0, Math.min(a.y0 + a.h, b.y0 + b.h) - y0);
  for (let row = 0; row < out.h; row++) {
    for (let col = 0; col < out.w; col++) {
      const at = (r: Raster) => r.bits[(y0 + row - r.y0) * r.w + (x0 + col - r.x0)]!;
      out.bits[row * out.w + col] = at(a) & at(b);
    }
  }
  return out;
}

const blockKey = (bx: number, by: number) => `${bx}_${by}`;

/** One player's explored area on one scene. */
export class FogMap {
  private blocks = new Map<string, Uint8Array>();

  constructor(readonly cell: number) {}

  /** Reads a map saved with `encode`. */
  static decode(saved: { cell: number; blocks: Record<string, string> }): FogMap {
    const map = new FogMap(saved.cell);
    for (const [key, data] of Object.entries(saved.blocks)) map.setBlock(key, fromBase64(data));
    return map;
  }

  /** The saved and sent form; with `keys`, only those blocks (an empty string for one left empty). */
  encode(keys?: readonly string[]): { cell: number; blocks: Record<string, string> } {
    const out: Record<string, string> = {};
    for (const key of keys ?? this.blocks.keys()) {
      const bytes = this.blocks.get(key);
      out[key] = bytes ? toBase64(bytes) : '';
    }
    return { cell: this.cell, blocks: out };
  }

  get empty(): boolean {
    return this.blocks.size === 0;
  }

  /** Whether the cell under point `p` has been explored. */
  explored(p: Point): boolean {
    return this.get(Math.floor(p[0] / this.cell), Math.floor(p[1] / this.cell));
  }

  /** A copy of one block's bits (all clear when it has none). */
  block(key: string): Uint8Array {
    const bytes = this.blocks.get(key);
    return bytes ? new Uint8Array(bytes) : new Uint8Array(BYTES);
  }

  /** Replaces one block; one with nothing set is dropped. */
  setBlock(key: string, bytes: Uint8Array): void {
    if (bytes.some((b) => b !== 0)) this.blocks.set(key, new Uint8Array(bytes));
    else this.blocks.delete(key);
  }

  /** Sets the raster's cells; returns the blocks that changed. */
  add(r: Raster): string[] {
    return this.paint(r, true);
  }

  /** Clears the raster's cells; returns the blocks that changed. */
  remove(r: Raster): string[] {
    return this.paint(r, false);
  }

  /** Every block with something in it. */
  keys(): string[] {
    return [...this.blocks.keys()];
  }

  private get(cx: number, cy: number): boolean {
    const bx = Math.floor(cx / FOG_BLOCK);
    const by = Math.floor(cy / FOG_BLOCK);
    const bytes = this.blocks.get(blockKey(bx, by));
    if (!bytes) return false;
    const i = (cy - by * FOG_BLOCK) * FOG_BLOCK + (cx - bx * FOG_BLOCK);
    return (bytes[i >> 3]! & (1 << (i & 7))) !== 0;
  }

  private paint(r: Raster, on: boolean): string[] {
    const changed = new Set<string>();
    for (let row = 0; row < r.h; row++) {
      for (let col = 0; col < r.w; col++) {
        if (r.bits[row * r.w + col] && this.put(r.x0 + col, r.y0 + row, on)) changed.add(this.keyOf(r, col, row));
      }
    }
    for (const key of changed) this.setBlock(key, this.block(key));
    return [...changed];
  }

  private keyOf(r: Raster, col: number, row: number): string {
    return blockKey(Math.floor((r.x0 + col) / FOG_BLOCK), Math.floor((r.y0 + row) / FOG_BLOCK));
  }

  /** Sets or clears one cell; true when it changed. */
  private put(cx: number, cy: number, on: boolean): boolean {
    const bx = Math.floor(cx / FOG_BLOCK);
    const by = Math.floor(cy / FOG_BLOCK);
    const key = blockKey(bx, by);
    let bytes = this.blocks.get(key);
    if (!bytes && !on) return false;
    if (!bytes) {
      bytes = new Uint8Array(BYTES);
      this.blocks.set(key, bytes);
    }
    const i = (cy - by * FOG_BLOCK) * FOG_BLOCK + (cx - bx * FOG_BLOCK);
    const bit = 1 << (i & 7);
    const was = (bytes[i >> 3]! & bit) !== 0;
    if (was === on) return false;
    bytes[i >> 3] = on ? bytes[i >> 3]! | bit : bytes[i >> 3]! & ~bit;
    return true;
  }
}

/** One map made of several: a cell is explored when any of them has it (the GM looking at every player). */
export function unionFog(maps: readonly FogMap[]): FogMap | undefined {
  if (maps.length <= 1) return maps[0];
  const out = new FogMap(maps[0]!.cell);
  for (const map of maps.filter((m) => m.cell === out.cell)) {
    for (const key of map.keys()) {
      const mine = out.block(key);
      const theirs = map.block(key);
      for (let i = 0; i < BYTES; i++) mine[i] = mine[i]! | theirs[i]!;
      out.setBlock(key, mine);
    }
  }
  return out;
}

/**
 * A block as it should be after undoing an edit that turned it from
 * `before` into `after`: cells the edit revealed are hidden again and
 * cells it hid come back, and everything else (explored since) stays.
 */
export function undoFogBlock(now: Uint8Array, before: Uint8Array, after: Uint8Array): Uint8Array {
  const out = new Uint8Array(BYTES);
  for (let i = 0; i < BYTES; i++) {
    const revealed = after[i]! & ~before[i]!;
    const hidden = before[i]! & ~after[i]!;
    out[i] = (now[i]! & ~revealed) | hidden;
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(data: string): Uint8Array {
  const s = atob(data);
  const out = new Uint8Array(BYTES);
  for (let i = 0; i < Math.min(s.length, BYTES); i++) out[i] = s.charCodeAt(i);
  return out;
}

// What a token explores --------------------------------------------------

export interface FogEye {
  at: Point;
  senses: Senses;
  /** Feet up: walls lower than this don't stop it. */
  elevation?: number;
}

export interface FogContext {
  /** Unlit places are dark (night): only senses and lights show anything. */
  dark: boolean;
  lights: readonly LightSource[];
  polygon: ReachPolygon;
  /** How far eyes reach, in pixels. */
  sight: number;
  gridSize: number;
  cell: number;
}

/**
 * The cells `eyes` make out now: everything in sight by day; at night what
 * their senses reach and what visible lights fall on. Like the client's
 * sight drawing (Vision.ts), so explored ground matches what was seen.
 */
export function exploredRasters(eyes: readonly FogEye[], ctx: FogContext): Raster[] {
  return eyes.flatMap((eye) => eyeRasters(eye, ctx));
}

function eyeRasters(eye: FogEye, ctx: FogContext): Raster[] {
  const sight = rasterize(ctx.polygon(eye.at, ctx.sight, 'sight', eye.elevation), ctx.cell);
  if (!ctx.dark) return [sight];
  const s = eye.senses;
  const sense = feetToPx(Math.max(s.darkvision, s.blindsight, s.truesight, s.devilsSight), ctx.gridSize);
  const out = sense > 0 ? [rasterize(ctx.polygon(eye.at, sense, 'sight', eye.elevation), ctx.cell)] : [];
  for (const l of ctx.lights) {
    const reach = feetToPx(l.bright + l.dim, ctx.gridSize);
    if (l.darkness || reach <= 0 || Math.hypot(l.x - eye.at[0], l.y - eye.at[1]) > ctx.sight + reach) continue;
    out.push(intersect(rasterize(lightReach(l, ctx.gridSize, ctx.polygon), ctx.cell), sight));
  }
  return out;
}
