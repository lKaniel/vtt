import type { Doc, Patch } from '@vtt/core';
import { boxHandles, type Handle, resizeBox, type Snap, snapPt } from './box-handles.ts';
import type { Rect } from './chunks.ts';
import { pointsBounds, type Shape } from './hit-test.ts';
import type { Point } from './schema.ts';
import type { Template } from './scene-items.ts';
import { aimTemplate, templateEnd, templateShape } from './templates.ts';
import { feetToPx } from './vision.ts';

// The editor's view of drawings, notes, templates, regions and sounds (the
// rest of placeables.ts covers tokens, tiles, walls and lights): what to pick
// them by, their handles and what dragging a handle does.

export type ItemMode = 'drawings' | 'notes' | 'templates' | 'regions' | 'sounds';
export type ItemType = 'drawing' | 'note' | 'template' | 'region' | 'sound';

export const ITEM_MODES: Record<ItemMode, { coll: ItemMode; type: ItemType }> = {
  drawings: { coll: 'drawings', type: 'drawing' },
  notes: { coll: 'notes', type: 'note' },
  templates: { coll: 'templates', type: 'template' },
  regions: { coll: 'regions', type: 'region' },
  sounds: { coll: 'sounds', type: 'sound' },
};

/** Squares a move snaps to, by mode: pins and templates to half squares. */
export function itemStep(mode: string): number {
  return mode === 'notes' || mode === 'sounds' || mode === 'templates' ? 0.5 : 1;
}

/** Pin sizes on screen, in screen pixels. */
const NOTE_PX = 14;
const SOUND_PX = 12;

interface View {
  gridSize: number;
  px: number;
}

const num = (doc: Doc, key: string): number => (doc[key] as number | undefined) ?? 0;
const pointsOf = (doc: Doc): Point[] => (doc.points as Point[] | undefined) ?? [];
const isBox = (doc: Doc): boolean => !Array.isArray(doc.points);
const rectOf = (doc: Doc): Rect => ({ x: num(doc, 'x'), y: num(doc, 'y'), w: num(doc, 'w'), h: num(doc, 'h') });
const asTemplate = (doc: Doc) => doc as unknown as Template;

function drawingShape(doc: Doc): Shape {
  if (isBox(doc)) return { kind: 'rect', ...rectOf(doc) };
  const points = pointsOf(doc);
  return doc.shape === 'polygon' ? { kind: 'polygon', points } : { kind: 'path', points };
}

export function itemShape(doc: Doc, view: View): Shape {
  const at: Point = [num(doc, 'x'), num(doc, 'y')];
  switch (doc.type) {
    case 'drawing':
      return drawingShape(doc);
    case 'note':
      return { kind: 'circle', c: at, r: NOTE_PX * view.px };
    case 'sound':
      return { kind: 'circle', c: at, r: SOUND_PX * view.px };
    case 'template':
      return templateShape(asTemplate(doc), view.gridSize);
    case 'region':
      return { kind: 'polygon', points: pointsOf(doc) };
    default:
      return { kind: 'circle', c: at, r: 0 };
  }
}

/** A handle on each point, and (closed runs) one in the middle of each side that puts in a new point. */
function pointHandles(points: readonly Point[], closed: boolean): Handle[] {
  const corners = points.map((at, i) => ({ id: `p${i}`, at }));
  const sides = closed ? points.length : points.length - 1;
  const middles = Array.from({ length: sides }, (_, i): Handle => {
    const [a, b] = [points[i]!, points[(i + 1) % points.length]!];
    return { id: `m${i}`, at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
  });
  return [...corners, ...middles];
}

function drawingHandles(doc: Doc): Handle[] {
  if (isBox(doc)) return boxHandles(rectOf(doc));
  if (doc.shape === 'freehand') return boxHandles(pointsBounds(pointsOf(doc)));
  return pointHandles(pointsOf(doc), doc.shape === 'polygon');
}

export function itemHandles(doc: Doc, view: View): Handle[] {
  switch (doc.type) {
    case 'drawing':
      return drawingHandles(doc);
    case 'region':
      return pointHandles(pointsOf(doc), true);
    case 'template':
      return [{ id: 'aim', at: templateEnd(asTemplate(doc), view.gridSize) }];
    case 'sound':
      return [{ id: 'radius', at: [num(doc, 'x') + feetToPx(num(doc, 'radius'), view.gridSize), num(doc, 'y')] }];
    default:
      return [];
  }
}

/** Moves point `p<i>`, or puts a new point after `m<i>`. */
function dragPoint(points: readonly Point[], handle: string, to: Point, s: Snap): Patch {
  const m = /^([pm])(\d+)$/.exec(handle);
  const i = m ? Number(m[2]) : -1;
  if (i < 0 || i >= points.length) return {};
  const at = snapPt(to, s);
  if (m![1] === 'p') return { points: points.map((p, j) => (j === i ? at : p)) };
  return { points: [...points.slice(0, i + 1), at, ...points.slice(i + 1)] };
}

/** Points stretched from one box to another. */
function scalePoints(points: readonly Point[], from: Rect, to: Rect): Point[] {
  const fx = from.w ? to.w / from.w : 1;
  const fy = from.h ? to.h / from.h : 1;
  return points.map(([x, y]) => [Math.round(to.x + (x - from.x) * fx), Math.round(to.y + (y - from.y) * fy)]);
}

function dragDrawing(doc: Doc, handle: string, to: Point, s: Snap): Patch {
  if (isBox(doc)) {
    const resized = resizeBox(rectOf(doc), handle, to, s);
    return resized ? { ...resized } : {};
  }
  const points = pointsOf(doc);
  if (doc.shape !== 'freehand') return dragPoint(points, handle, to, s);
  const from = pointsBounds(points);
  const box = resizeBox(from, handle, to, s);
  return box ? { points: scalePoints(points, from, box) } : {};
}

/** A sound's radius out to `to`, in 5 ft steps (1 ft free). */
function dragRadius(doc: Doc, to: Point, s: Snap): Patch {
  const feet = (Math.hypot(to[0] - num(doc, 'x'), to[1] - num(doc, 'y')) / s.gridSize) * 5;
  const step = s.free ? 1 : 5;
  return { radius: Math.max(step, Math.round(feet / step) * step) };
}

export function itemDrag(doc: Doc, handle: string, to: Point, s: Snap): Patch {
  switch (doc.type) {
    case 'drawing':
      return dragDrawing(doc, handle, to, s);
    case 'region':
      return dragPoint(pointsOf(doc), handle, to, s);
    case 'template':
      return handle === 'aim' ? aimTemplate(asTemplate(doc), to, s) : {};
    case 'sound':
      return handle === 'radius' ? dragRadius(doc, to, s) : {};
    default:
      return {};
  }
}
