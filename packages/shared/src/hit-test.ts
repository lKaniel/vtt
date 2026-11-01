import type { Rect } from './chunks.ts';
import { segmentsIntersect } from './geometry.ts';
import type { Point } from './schema.ts';

// Hit-testing for the map editor: what is under the pointer, and what a
// dragged rectangle takes. Everything the editor picks is reduced to one of
// three shapes here, so this module (with geometry.ts) is the one boundary a
// faster implementation (Rust/WASM, a spatial index) can replace later.

export type Shape =
  | { kind: 'circle'; c: Point; r: number }
  | { kind: 'segment'; a: Point; b: Point }
  | { kind: 'rect'; x: number; y: number; w: number; h: number };

/** Something the editor can pick, named by `key`. */
export interface Hittable {
  key: string;
  shape: Shape;
}

/** How a marquee picks: everything it touches (Figma's rule), or only what it holds whole (Alt). */
export type MarqueeMode = 'touch' | 'contain';

const dist = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function nearestOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return [a[0] + dx * t, a[1] + dy * t];
}

function clampToRect(p: Point, r: Rect): Point {
  return [Math.max(r.x, Math.min(r.x + r.w, p[0])), Math.max(r.y, Math.min(r.y + r.h, p[1]))];
}

/** How far `p` is from the shape: 0 on or inside it. */
export function distanceTo(shape: Shape, p: Point): number {
  switch (shape.kind) {
    case 'circle':
      return Math.max(0, dist(p, shape.c) - shape.r);
    case 'segment':
      return dist(p, nearestOnSegment(p, shape.a, shape.b));
    case 'rect':
      return dist(p, clampToRect(p, shape));
  }
}

/** The topmost item (items are listed bottom to top) within `reach` of `p`. */
export function hitTest(items: readonly Hittable[], p: Point, reach: number): string | undefined {
  for (let i = items.length - 1; i >= 0; i--) if (distanceTo(items[i]!.shape, p) <= reach) return items[i]!.key;
  return undefined;
}

/** The rectangle between two corners, whichever way it was dragged. */
export function rectBetween(a: Point, b: Point): Rect {
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
}

export function shapeBounds(shape: Shape): Rect {
  switch (shape.kind) {
    case 'circle':
      return { x: shape.c[0] - shape.r, y: shape.c[1] - shape.r, w: shape.r * 2, h: shape.r * 2 };
    case 'segment':
      return rectBetween(shape.a, shape.b);
    case 'rect':
      return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
  }
}

function inside(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

function corners(r: Rect): Point[] {
  return [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h],
  ];
}

function segmentTouches(a: Point, b: Point, r: Rect): boolean {
  if (inside(rectBetween(a, a), r)) return true;
  const c = corners(r);
  return c.some((p, i) => segmentsIntersect(a, b, p, c[(i + 1) % 4]!));
}

function touches(shape: Shape, r: Rect): boolean {
  switch (shape.kind) {
    case 'circle':
      return dist(shape.c, clampToRect(shape.c, r)) <= shape.r;
    case 'segment':
      return segmentTouches(shape.a, shape.b, r);
    case 'rect':
      return overlaps(shape, r);
  }
}

/** The keys of the items a dragged rectangle picks, in their order. */
export function marqueeHits(items: readonly Hittable[], r: Rect, mode: MarqueeMode): string[] {
  const picks = mode === 'contain' ? (s: Shape) => inside(shapeBounds(s), r) : (s: Shape) => touches(s, r);
  return items.filter((item) => picks(item.shape)).map((item) => item.key);
}
