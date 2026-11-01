import { type TileTexture, TileTextureSchema } from '@vtt/shared';

// Floor textures painted from noise, so maps look like ground and planks
// instead of flat colour without shipping any image files. Each texture is
// grey (the tile's colour tints it), repeats seamlessly, and comes out the
// same every time. Pure functions: the client copies the pixels to a canvas.

export const TEXTURES = TileTextureSchema.options;
type TextureKind = TileTexture;

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const wrap = (i: number, period: number) => ((i % period) + period) % period;
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Value noise in [0, 1] on a lattice that repeats every `period` units. */
export function periodicNoise(x: number, y: number, period: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const at = (dx: number, dy: number) => hash(wrap(ix + dx, period), wrap(iy + dy, period), seed);
  const tx = smooth(x - ix);
  const ty = smooth(y - iy);
  return lerp(lerp(at(0, 0), at(1, 0), tx), lerp(at(0, 1), at(1, 1), tx), ty);
}

/** Several octaves of noise over the unit square, `base` lattice cells across. */
function fbm(u: number, v: number, base: number, seed: number): number {
  let sum = 0;
  let weight = 0.5;
  let total = 0;
  for (let o = 0, cells = base; o < 4; o++, cells *= 2, weight /= 2) {
    sum += weight * periodicNoise(u * cells, v * cells, cells, seed + o);
    total += weight;
  }
  return sum / total;
}

interface Cell {
  /** Distance to the nearest cell point, and how far inside the cell (distance to its edge). */
  edge: number;
  id: number;
}

/** Jittered cells, `n` across, wrapping at the edges: flagstones and cobbles. */
function cells(u: number, v: number, n: number, seed: number): Cell {
  const cx = Math.floor(u * n);
  const cy = Math.floor(v * n);
  let d1 = Infinity;
  let d2 = Infinity;
  let id = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const gx = wrap(cx + dx, n);
      const gy = wrap(cy + dy, n);
      const px = (cx + dx + 0.15 + 0.7 * hash(gx, gy, seed)) / n;
      const py = (cy + dy + 0.15 + 0.7 * hash(gy, gx, seed + 9)) / n;
      const d = Math.hypot(px - u, py - v) * n;
      if (d < d1) [d2, d1, id] = [d1, d, gx * 131 + gy];
      else if (d < d2) d2 = d;
    }
  }
  return { edge: (d2 - d1) / 2, id };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function stone(u: number, v: number): number {
  const c = cells(u, v, 4, 5);
  if (c.edge < 0.03) return 0.58 + 0.1 * fbm(u, v, 16, 7);
  return 0.76 + 0.1 * hash(c.id, 1, 3) + 0.12 * fbm(u, v, 8, 6) - 0.07 * (1 - clamp01(c.edge / 0.12));
}

function cobble(u: number, v: number): number {
  const c = cells(u, v, 8, 11);
  const round = smooth(clamp01(c.edge / 0.25));
  return 0.42 + 0.42 * round + 0.12 * hash(c.id, 2, 4) + 0.06 * fbm(u, v, 16, 12);
}

const PLANKS = 6;

function wood(u: number, v: number): number {
  const row = Math.floor(v * PLANKS);
  const along = wrap(u + hash(row, 0, 21), 1);
  const across = v * PLANKS - row;
  if (across < 0.05 || along < 0.006) return 0.4;
  const grain = 0.035 * Math.sin(across * 26 + fbm(u, v, 4, 22) * 9) + 0.07 * periodicNoise(u * 8, v * 192, 8, 25);
  return 0.76 + 0.1 * hash(row, 1, 23) + grain + 0.06 * fbm(u, v, 4, 24);
}

const PAINTERS: Record<TextureKind, (u: number, v: number) => number> = {
  grass: (u, v) =>
    0.66 + 0.16 * fbm(u, v, 2, 13) + 0.12 * fbm(u, v, 8, 1) + 0.1 * periodicNoise(u * 96, v * 24, 96, 2) - 0.03,
  dirt: (u, v) => 0.72 + 0.22 * fbm(u, v, 4, 3) + (hash(Math.floor(u * 64), Math.floor(v * 64), 4) > 0.97 ? -0.15 : 0),
  sand: (u, v) => 0.84 + 0.1 * fbm(u, v, 8, 5) + 0.04 * Math.sin((v + 0.05 * fbm(u, v, 2, 6)) * Math.PI * 16),
  stone,
  cobble,
  wood,
  water: (u, v) => 0.76 + 0.16 * fbm(u, v, 3, 8) + 0.08 * Math.abs(Math.sin(fbm(u, v, 4, 9) * Math.PI * 6)),
  rock: (u, v) => 0.62 + 0.36 * (1 - Math.abs(fbm(u, v, 4, 10) * 2 - 1)),
};

/** RGBA pixels of a `size` square texture. */
export function paintTexture(kind: TextureKind, size: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(size * size * 4);
  const paint = PAINTERS[kind];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const g = Math.round(clamp01(paint(x / size, y / size)) * 255);
      out.set([g, g, g, 255], (y * size + x) * 4);
    }
  }
  return out;
}
