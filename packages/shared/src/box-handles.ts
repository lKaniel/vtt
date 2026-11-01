import type { Rect } from './chunks.ts';
import type { Point } from './schema.ts';

// The 8 handles of a box (a tile, a box drawing, the box round a freehand
// line) and what dragging one does: Figma's resize, snapped to the grid.

export interface Snap {
  gridSize: number;
  /** Shift: no snapping. */
  free: boolean;
}

export interface Handle {
  id: string;
  at: Point;
}

const roundTo = (v: number, step: number): number => Math.round(v / step) * step;

/** A point on the grid's corners (Shift: on whole pixels). */
export const snapPt = (p: Point, s: Snap): Point => [
  roundTo(p[0], s.free ? 1 : s.gridSize),
  roundTo(p[1], s.free ? 1 : s.gridSize),
];

/** Box handles, with the share of the width and height each sits at. */
const BOX_HANDLES: Record<string, Point> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5],
};

export function boxHandles(r: Rect): Handle[] {
  return Object.entries(BOX_HANDLES).map(([id, [fx, fy]]) => ({ id, at: [r.x + r.w * fx, r.y + r.h * fy] }));
}

/** Moves the edge a handle sits on along one axis (f 0: the low edge, 1: the high one, 0.5: neither). */
function edgeMove([lo, size]: [number, number], f: number, to: number, min: number): [number, number] {
  if (f === 0.5) return [lo, size];
  const hi = lo + size;
  if (f === 0) {
    const start = Math.min(to, hi - min);
    return [start, hi - start];
  }
  return [lo, Math.max(min, to - lo)];
}

/** The box after dragging handle `handle` to `to`; undefined for a handle it doesn't have. */
export function resizeBox(r: Rect, handle: string, to: Point, s: Snap): Rect | undefined {
  const f = BOX_HANDLES[handle];
  if (!f) return undefined;
  const at = snapPt(to, s);
  const min = s.free ? 1 : s.gridSize;
  const [x, w] = edgeMove([r.x, r.w], f[0], at[0], min);
  const [y, h] = edgeMove([r.y, r.h], f[1], at[1], min);
  return { x, y, w, h };
}
