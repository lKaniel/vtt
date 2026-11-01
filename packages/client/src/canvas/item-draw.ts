import type { Doc } from '@vtt/core';
import { feetToPx, ITEM_MODES, type Point, type Shape, shapeOf } from '@vtt/shared';
import type { Graphics } from 'pixi.js';
import type { ItemTool } from '../editor/shape-tools.ts';

// How drawings, templates, notes, regions and sounds look on the map, and
// the shape a tool is drawing. Text (a text drawing, a note's label) is
// drawn by ItemLayer with Pixi text; this is the vector part.

/** Line widths and sizes are in screen pixels; `px` is map pixels per screen pixel. */
interface Ctx {
  px: number;
  gridSize: number;
}

const color = (c: unknown, fallback: number): number =>
  typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? Number.parseInt(c.slice(1), 16) : fallback;

const NOTE_PX = 14;
const SOUND_PX = 12;

/** Traces a shape (without filling or stroking it). */
export function traceShape(g: Graphics, shape: Shape): Graphics {
  switch (shape.kind) {
    case 'circle':
      return g.circle(shape.c[0], shape.c[1], shape.r);
    case 'rect':
      return g.rect(shape.x, shape.y, shape.w, shape.h);
    case 'segment':
      return g.moveTo(...shape.a).lineTo(...shape.b);
    case 'polygon':
      return g.poly(shape.points.flat(), true);
    case 'path':
      return g.poly(shape.points.flat(), false);
  }
}

function drawDrawing(g: Graphics, d: Doc, { px }: Ctx): void {
  const stroke = { width: (d.strokeWidth as number | undefined) ?? 4, color: color(d.stroke, 0xffffff), alpha: 0.95 };
  const fill = d.fill
    ? { color: color(d.fill, 0xffffff), alpha: (d.fillAlpha as number | undefined) ?? 0.5 }
    : undefined;
  if (d.shape === 'text') return;
  if (d.shape === 'ellipse') {
    const [x, y, w, h] = [d.x, d.y, d.w, d.h] as number[];
    g.ellipse(x! + w! / 2, y! + h! / 2, w! / 2, h! / 2);
  } else if (d.shape === 'rect') g.rect(d.x as number, d.y as number, d.w as number, d.h as number);
  else g.poly((d.points as Point[]).flat(), d.shape === 'polygon');
  if (fill && d.shape !== 'line' && d.shape !== 'freehand') g.fill(fill);
  g.stroke({ ...stroke, width: Math.max(stroke.width, px), cap: 'round', join: 'round' });
}

function drawTemplate(g: Graphics, t: Doc, ctx: Ctx): void {
  const c = color(t.color, 0xffcc00);
  traceShape(g, shapeOf(t, ctx))
    .fill({ color: c, alpha: 0.18 })
    .stroke({ width: 2 * ctx.px, color: c, alpha: 0.85 });
}

function drawNote(g: Graphics, n: Doc, { px }: Ctx): void {
  const [x, y] = [n.x as number, n.y as number];
  g.circle(x, y, NOTE_PX * px)
    .fill({ color: color(n.color, 0x3a2a1a), alpha: 0.95 })
    .stroke({ width: 2 * px, color: 0xf0d8a0 });
  g.rect(x - 5 * px, y - 6 * px, 10 * px, 12 * px).fill(0xf0d8a0);
}

function drawRegion(g: Graphics, r: Doc, { px }: Ctx): void {
  const c = color(r.color, 0x40c0a0);
  g.poly((r.points as Point[]).flat(), true)
    .fill({ color: c, alpha: r.disabled ? 0.05 : 0.15 })
    .stroke({ width: 2 * px, color: c, alpha: r.disabled ? 0.4 : 0.9 });
}

function drawSound(g: Graphics, s: Doc, { px, gridSize }: Ctx): void {
  const [x, y] = [s.x as number, s.y as number];
  g.circle(x, y, feetToPx(s.radius as number, gridSize)).stroke({ width: 1.5 * px, color: 0x8ad0ff, alpha: 0.5 });
  g.circle(x, y, SOUND_PX * px)
    .fill({ color: 0x15120f, alpha: 0.85 })
    .stroke({ width: 2 * px, color: 0x8ad0ff });
  g.poly(
    [
      x - 5 * px,
      y - 3 * px,
      x - 1 * px,
      y - 3 * px,
      x + 4 * px,
      y - 7 * px,
      x + 4 * px,
      y + 7 * px,
      x - 1 * px,
      y + 3 * px,
      x - 5 * px,
      y + 3 * px,
    ],
    true,
  ).fill(0x8ad0ff);
}

const DRAW: Record<string, (g: Graphics, doc: Doc, ctx: Ctx) => void> = {
  drawing: drawDrawing,
  template: drawTemplate,
  note: drawNote,
  region: drawRegion,
  sound: drawSound,
};

/** Draws one drawing, template, note, region or sound. */
export function drawItem(g: Graphics, doc: Doc, ctx: Ctx): void {
  DRAW[doc.type]?.(g, doc, ctx);
}

const TOOL_TYPES: Partial<Record<ItemTool, string>> = { note: 'note', sound: 'sound', region: 'region' };
const TEMPLATE_TOOLS = new Set<ItemTool>(['circle', 'cone', 'ray', 'square']);

/** What a shape tool is drawing, or where a click would put a pin. */
export function drawDraft(
  g: Graphics,
  { data, tool, hover }: { data: Record<string, unknown> | undefined; tool: ItemTool; hover: Point },
  ctx: Ctx,
): void {
  if (!data) {
    g.circle(hover[0], hover[1], 5 * ctx.px).fill({ color: 0xffffff, alpha: 0.9 });
    return;
  }
  const type = TOOL_TYPES[tool] ?? (TEMPLATE_TOOLS.has(tool) ? 'template' : 'drawing');
  const doc = { id: 'draft', rev: 0, type, ...data } as Doc;
  if (type === 'drawing' && data.shape === 'text')
    g.rect(data.x as number, data.y as number, data.w as number, data.h as number).stroke({
      width: ctx.px,
      color: 0xffffff,
    });
  else if (type === 'region')
    g.poly((data.points as Point[]).flat(), false).stroke({ width: 2 * ctx.px, color: 0x40c0a0 });
  else drawItem(g, doc, ctx);
}

/** Whether `type` is one of the item types this file draws. */
export const isItemType = (type: string): boolean => Object.values(ITEM_MODES).some((m) => m.type === type);
