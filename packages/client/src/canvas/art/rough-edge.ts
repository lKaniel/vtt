import type { Rect } from '@vtt/shared';

/** Spacing of the points along a rough edge, and how far they stray from it, in map pixels. */
const STEP = 25;
const AMPLITUDE = 14;

function hash(a: number, b: number, seed: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** How far the edge strays at `along` on the line at `line`: the same wherever that line is drawn. */
function wobble(along: number, line: number): number {
  const i = Math.round(along / STEP);
  const fine = 2 * hash(i, line, 77) - 1;
  const broad = 2 * hash(Math.floor(i / 4), line, 78) - 1;
  return AMPLITUDE * (0.55 * fine + 0.45 * broad);
}

const onBorder = (v: number, chunkSize: number) => v % chunkSize === 0;

/** Points from `from` to `to` (exclusive) along a line, every STEP, snapped to the world grid of steps. */
function stops(from: number, to: number): number[] {
  const out = [from];
  const dir = Math.sign(to - from);
  for (let v = Math.floor(from / STEP) * STEP + (dir > 0 ? STEP : 0); dir * (to - v) > 0; v += dir * STEP)
    if (v !== from) out.push(v);
  return out;
}

/**
 * The outline of a tile with natural, wobbly edges, as a flat polygon. Edges
 * on a chunk border stay straight so neighbouring chunks meet cleanly.
 */
export function roughOutline(r: Rect, chunkSize: number): number[] {
  const x1 = r.x + r.w;
  const y1 = r.y + r.h;
  const out: number[] = [];
  const horizontal = (y: number, from: number, to: number) => {
    const straight = onBorder(y, chunkSize);
    for (const x of stops(from, to)) out.push(x, y + (straight ? 0 : wobble(x, y)));
  };
  const vertical = (x: number, from: number, to: number) => {
    const straight = onBorder(x, chunkSize);
    for (const y of stops(from, to)) out.push(x + (straight ? 0 : wobble(y, x)), y);
  };
  horizontal(r.y, r.x, x1);
  vertical(x1, r.y, y1);
  horizontal(y1, x1, r.x);
  vertical(r.x, y1, r.y);
  return out;
}
