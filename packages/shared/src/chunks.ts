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
