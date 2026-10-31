import type { Chunk, Light, MapEdit, Point } from '@vtt/shared';

/** The GM's map tools; with none picked the map plays as usual. */
export type MapTool = 'wall' | 'door' | 'window' | 'light' | 'erase';

export type LightPreset = 'candle' | 'torch' | 'lantern' | 'campfire' | 'magic' | 'moonbeam' | 'darkness';

/** Lights with their rules radii (feet) and a look to match. */
export const LIGHT_PRESETS: Record<LightPreset, Light & { label: string }> = {
  candle: { label: 'Candle', bright: 5, dim: 5, color: '#ffc070', animation: 'flicker' },
  torch: { label: 'Torch', bright: 20, dim: 20, color: '#ff9a40', animation: 'flicker' },
  lantern: { label: 'Lantern', bright: 30, dim: 30, color: '#ffd8a0' },
  campfire: { label: 'Campfire', bright: 20, dim: 40, color: '#ff7a30', animation: 'flicker' },
  magic: { label: 'Magic glow', bright: 20, dim: 20, color: '#7ab0ff', animation: 'pulse' },
  moonbeam: { label: 'Moonlight', bright: 0, dim: 30, color: '#b8c8ff' },
  darkness: { label: 'Magical darkness', bright: 15, dim: 0, darkness: true },
};

export function snapPoint(p: Point, gridSize: number, snap: boolean): Point {
  if (!snap) return [Math.round(p[0]), Math.round(p[1])];
  return [Math.round(p[0] / gridSize) * gridSize, Math.round(p[1] / gridSize) * gridSize];
}

const WALL_KINDS = { wall: {}, door: { door: 'closed' as const }, window: { sight: false } };

export function wallEdit(tool: keyof typeof WALL_KINDS, a: Point, b: Point): Extract<MapEdit, { op: 'addWall' }> {
  return { op: 'addWall', wall: { a, b, ...WALL_KINDS[tool] } };
}

export interface Picked {
  chunk: string;
  id: string;
  kind: 'wall' | 'light';
  /** The light's position, or the wall's nearest point to the pointer. */
  at: Point;
}

function nearestOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return [a[0] + dx * t, a[1] + dy * t];
}

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

type Chunks = ReadonlyMap<string, Chunk>;

function nearestLight(chunks: Chunks, p: Point, reach: number): Picked | undefined {
  let best: Picked | undefined;
  let bestDistance = reach;
  for (const [chunk, c] of chunks) {
    for (const l of c.lights) {
      const d = distance(p, [l.x, l.y]);
      if (d <= bestDistance) [best, bestDistance] = [{ chunk, id: l.id, kind: 'light', at: [l.x, l.y] }, d];
    }
  }
  return best;
}

function nearestWall(chunks: Chunks, p: Point, reach: number): Picked | undefined {
  let best: Picked | undefined;
  let bestDistance = reach;
  for (const [chunk, c] of chunks) {
    for (const w of c.walls) {
      const at = nearestOnSegment(p, w.a, w.b);
      const d = distance(p, at);
      if (d <= bestDistance) [best, bestDistance] = [{ chunk, id: w.id, kind: 'wall', at }, d];
    }
  }
  return best;
}

/** The light, or failing that the wall, within `reach` map pixels of `p`. Lights win: they sit on top. */
export function pickAt(chunks: Chunks, p: Point, reach: number): Picked | undefined {
  return nearestLight(chunks, p, reach) ?? nearestWall(chunks, p, reach);
}
