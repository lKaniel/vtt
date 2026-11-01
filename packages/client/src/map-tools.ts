import type { Light, MapEdit, Point } from '@vtt/shared';

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
