import type { Doc } from '@vtt/core';
import { feetToPx, handlesOf, type Point, type Rect, shapeOf } from '@vtt/shared';
import type { Graphics } from 'pixi.js';
import { traceShape } from './item-draw.ts';
import { lightColor } from './lighting/light-style.ts';

// How the map editor draws: walls and lights in their modes, the selection
// with its handles, the marquee and the line a wall tool is drawing.

export const WALL_COLOR = 0x6fd0ff;
export const DOOR_COLOR = 0xffb050;
const WINDOW_COLOR = 0xa0f0ff;
const SELECT_COLOR = 0xffe08a;
const HOVER_COLOR = 0xffffff;
const HANDLE_FILL = 0x15120f;

/** Line widths and sizes are in screen pixels; `px` is map pixels per screen pixel. */
export interface DrawCtx {
  px: number;
  gridSize: number;
}

function wallColor(w: Doc): number {
  if (w.door) return DOOR_COLOR;
  return w.sight === false ? WINDOW_COLOR : WALL_COLOR;
}

export function drawWall(g: Graphics, w: Doc, { px }: DrawCtx): void {
  const [a, b] = [w.a as Point, w.b as Point];
  const color = wallColor(w);
  g.moveTo(...a)
    .lineTo(...b)
    .stroke({ width: 3 * px, color, alpha: 0.9 });
  for (const end of [a, b]) g.circle(end[0], end[1], 4 * px).fill(color);
}

export function drawLight(g: Graphics, l: Doc, { px, gridSize }: DrawCtx): void {
  const color = l.darkness ? 0x3a2a5a : lightColor(l as { color?: string });
  const [x, y] = [l.x as number, l.y as number];
  const reach = feetToPx((l.bright as number) + ((l.dim as number | undefined) ?? 0), gridSize);
  g.circle(x, y, reach).stroke({ width: 1.5 * px, color, alpha: 0.5 });
  g.circle(x, y, 11 * px)
    .fill({ color: 0x15120f, alpha: 0.85 })
    .stroke({ width: 2 * px, color });
  g.circle(x, y, 5 * px).fill(color);
}

/** The outline of a selected (or hovered) thing. */
export function drawOutline(g: Graphics, doc: Doc, ctx: DrawCtx, hover = false): void {
  const { px } = ctx;
  const stroke = { width: (hover ? 2 : 3) * px, color: hover ? HOVER_COLOR : SELECT_COLOR, alpha: hover ? 0.6 : 1 };
  if (doc.type === 'wall') {
    g.moveTo(...(doc.a as Point))
      .lineTo(...(doc.b as Point))
      .stroke({ ...stroke, width: stroke.width + 4 * px, alpha: 0.45 });
  } else if (doc.type === 'light') {
    const [x, y] = [doc.x as number, doc.y as number];
    g.circle(x, y, 15 * px).stroke(stroke);
    g.circle(x, y, feetToPx(doc.bright as number, ctx.gridSize)).stroke({ ...stroke, width: px, alpha: 0.7 });
  } else if (doc.type === 'tile') {
    g.rect(doc.x as number, doc.y as number, doc.w as number, doc.h as number).stroke(stroke);
  } else traceShape(g, shapeOf(doc, ctx)).stroke(stroke);
}

export function drawHandles(g: Graphics, doc: Doc, ctx: DrawCtx): void {
  const s = 5 * ctx.px;
  for (const h of handlesOf(doc, ctx)) {
    g.rect(h.at[0] - s, h.at[1] - s, s * 2, s * 2)
      .fill(HANDLE_FILL)
      .stroke({ width: 1.5 * ctx.px, color: SELECT_COLOR });
  }
}

export function drawMarquee(g: Graphics, r: Rect, { px }: DrawCtx): void {
  g.rect(r.x, r.y, r.w, r.h)
    .fill({ color: SELECT_COLOR, alpha: 0.08 })
    .stroke({ width: px, color: SELECT_COLOR, alpha: 0.9 });
}
