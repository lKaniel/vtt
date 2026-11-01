import type { Chunk, PlacedLight, Tile, Wall } from './schema.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function chunkKey(cx: number, cy: number): string {
  return `${cx}_${cy}`;
}

const KEY = /^(-?\d+)_(-?\d+)$/;

export function parseChunkKey(key: string): [number, number] | null {
  const m = KEY.exec(key);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export function chunkOf(x: number, y: number, chunkSize: number): string {
  return chunkKey(Math.floor(x / chunkSize), Math.floor(y / chunkSize));
}

export function chunkRect(key: string, chunkSize: number): Rect | null {
  const c = parseChunkKey(key);
  return c ? { x: c[0] * chunkSize, y: c[1] * chunkSize, w: chunkSize, h: chunkSize } : null;
}

/** Keys of every chunk that overlaps the rectangle. */
export function chunksInRect(r: Rect, chunkSize: number): string[] {
  const keys: string[] = [];
  const x0 = Math.floor(r.x / chunkSize);
  const y0 = Math.floor(r.y / chunkSize);
  const x1 = Math.floor((r.x + r.w) / chunkSize);
  const y1 = Math.floor((r.y + r.h) / chunkSize);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) keys.push(chunkKey(cx, cy));
  return keys;
}

/** The map collections the server streams to clients in chunks. */
export type MapCollection = 'tiles' | 'walls' | 'lights';

type MapItem<C extends MapCollection> = Chunk[C][number];

/** The chunk an item streams in: a tile by its top-left corner, a wall by its midpoint, a light by its centre. */
export function anchorChunk<C extends MapCollection>(coll: C, item: MapItem<C>, chunkSize: number): string {
  if (coll === 'walls') {
    const { a, b } = item as Wall;
    return chunkOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, chunkSize);
  }
  const { x, y } = item as Tile | PlacedLight;
  return chunkOf(x, y, chunkSize);
}

/**
 * Splits a scene's map into chunks, keeping each collection's order. With
 * `only`, builds just those chunks (empty ones included).
 */
export function groupChunks(scene: Chunk, chunkSize: number, only?: ReadonlySet<string>): Map<string, Chunk> {
  const out = new Map<string, Chunk>();
  for (const key of only ?? []) out.set(key, { tiles: [], walls: [], lights: [] });
  const colls: MapCollection[] = ['tiles', 'walls', 'lights'];
  for (const coll of colls) {
    for (const item of scene[coll]) {
      const key = anchorChunk(coll, item, chunkSize);
      if (only && !only.has(key)) continue;
      const chunk = out.get(key) ?? { tiles: [], walls: [], lights: [] };
      out.set(key, chunk);
      (chunk[coll] as MapItem<typeof coll>[]).push(item);
    }
  }
  return out;
}
