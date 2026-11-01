import type { Doc, Patch } from '@vtt/core';
import { boxHandles, type Handle, resizeBox, type Snap, snapPt } from './box-handles.ts';
import { EDIT_KINDS } from './edit-kinds.ts';
import { itemDrag, itemHandles, type ItemMode, ITEM_MODES, itemShape, itemStep, type ItemType } from './item-shapes.ts';
import type { Shape } from './hit-test.ts';
import type { Point } from './schema.ts';
import { feetToPx } from './vision.ts';

// What the map editor needs to know about each kind of placeable: its shape
// for picking, its handles and what dragging one does, and how it moves.
// Moving reuses EDIT_KINDS, so paste and drag agree on where things go.

/** The editor's modes: each selects and edits one collection of the scene. */
export type EditorMode = 'tokens' | 'tiles' | 'walls' | 'lights' | ItemMode;
export type PlaceableType = 'token' | 'tile' | 'wall' | 'light' | ItemType;

export const MODES: Record<EditorMode, { coll: EditorMode; type: PlaceableType }> = {
  tokens: { coll: 'tokens', type: 'token' },
  tiles: { coll: 'tiles', type: 'tile' },
  walls: { coll: 'walls', type: 'wall' },
  lights: { coll: 'lights', type: 'light' },
  ...ITEM_MODES,
};

/** Grid size, and map pixels per screen pixel (icons keep their size on screen). */
export interface View {
  gridSize: number;
  px: number;
}

export type { Handle, Snap } from './box-handles.ts';

/** Light icons on the map, screen pixels. */
const LIGHT_ICON = 12;
/** A token's disc as a share of its square, as the token layer draws it. */
const TOKEN_DISC = 0.42;

const num = (doc: Doc, key: string): number => (doc[key] as number | undefined) ?? 0;
const pt = (doc: Doc, key: string): Point => doc[key] as Point;
const dist = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const same = (a: Point, b: Point): boolean => a[0] === b[0] && a[1] === b[1];

function rectOf(doc: Doc): { x: number; y: number; w: number; h: number } {
  return { x: num(doc, 'x'), y: num(doc, 'y'), w: num(doc, 'w'), h: num(doc, 'h') };
}

export function shapeOf(doc: Doc, view: View): Shape {
  switch (doc.type) {
    case 'wall':
      return { kind: 'segment', a: pt(doc, 'a'), b: pt(doc, 'b') };
    case 'tile':
      return { kind: 'rect', ...rectOf(doc) };
    case 'light':
      return { kind: 'circle', c: [num(doc, 'x'), num(doc, 'y')], r: LIGHT_ICON * view.px };
    case 'token':
      return {
        kind: 'circle',
        c: [num(doc, 'x'), num(doc, 'y')],
        r: (num(doc, 'size') || 1) * view.gridSize * TOKEN_DISC,
      };
    default:
      return itemShape(doc, view);
  }
}

/** The fields a move changes, as a patch. */
export function moveBy(doc: Doc, [dx, dy]: Point): Patch {
  const kind = EDIT_KINDS[doc.type];
  if (!kind?.shift) return {};
  const moved = kind.shift(doc, dx, dy);
  return Object.fromEntries(Object.entries(moved).filter(([key, value]) => value !== doc[key]));
}

/** Map pixels a move snaps to: whole squares, half squares for lights. */
function moveStep(mode: EditorMode, gridSize: number): number {
  return mode === 'lights' ? gridSize / 2 : gridSize * itemStep(mode);
}

const roundTo = (v: number, step: number): number => Math.round(v / step) * step;

export function snapDelta(d: Point, mode: EditorMode, gridSize: number, free: boolean): Point {
  const step = free ? 1 : moveStep(mode, gridSize);
  return [roundTo(d[0], step), roundTo(d[1], step)];
}

// Handles ---------------------------------------------------------------------

function lightHandles(doc: Doc, gridSize: number): Handle[] {
  const [x, y] = [num(doc, 'x'), num(doc, 'y')];
  const bright = feetToPx(num(doc, 'bright'), gridSize);
  const reach = feetToPx(num(doc, 'bright') + num(doc, 'dim'), gridSize);
  // The dim ring's handle sits at a slant, so it never hides under the bright one.
  return [
    { id: 'bright', at: [x + bright, y] },
    { id: 'dim', at: [x + reach * Math.SQRT1_2, y + reach * Math.SQRT1_2] },
  ];
}

export function handlesOf(doc: Doc, view: View): Handle[] {
  switch (doc.type) {
    case 'wall':
      return [
        { id: 'a', at: pt(doc, 'a') },
        { id: 'b', at: pt(doc, 'b') },
      ];
    case 'light':
      return lightHandles(doc, view.gridSize);
    case 'tile':
      return boxHandles(rectOf(doc));
    default:
      return itemHandles(doc, view);
  }
}

function dragWallEnd(doc: Doc, handle: string, to: Point, s: Snap): Patch {
  if (handle !== 'a' && handle !== 'b') return {};
  const at = snapPt(to, s);
  const other = pt(doc, handle === 'a' ? 'b' : 'a');
  return same(at, other) ? {} : { [handle]: at };
}

/** Radius in feet from the light to `to`, in 5 ft steps (1 ft free). */
function feetTo(doc: Doc, to: Point, s: Snap): number {
  const feet = (dist(to, [num(doc, 'x'), num(doc, 'y')]) / s.gridSize) * 5;
  return roundTo(feet, s.free ? 1 : 5);
}

function dragLightRing(doc: Doc, handle: string, to: Point, s: Snap): Patch {
  const r = feetTo(doc, to, s);
  const bright = num(doc, 'bright');
  if (handle === 'dim') return { dim: Math.max(0, r - bright) };
  if (handle !== 'bright') return {};
  // The outer edge stays where it was: dim light fills the rest.
  return { bright: r, dim: Math.max(0, bright + num(doc, 'dim') - r) };
}

function resizeTile(doc: Doc, handle: string, to: Point, s: Snap): Patch {
  const box = resizeBox(rectOf(doc), handle, to, s);
  return box ? { ...box } : {};
}

/** What dragging one of a document's handles to `to` changes. */
export function dragHandle(doc: Doc, handle: string, to: Point, s: Snap): Patch {
  switch (doc.type) {
    case 'wall':
      return dragWallEnd(doc, handle, to, s);
    case 'light':
      return dragLightRing(doc, handle, to, s);
    case 'tile':
      return resizeTile(doc, handle, to, s);
    default:
      return itemDrag(doc, handle, to, s);
  }
}

/** A document with a patch applied, as the store would (null removes a field); for previews. */
export function applyPatch(doc: Doc, patch: Patch): Doc {
  const merged = Object.entries({ ...doc, ...patch }).filter(([, value]) => value !== null);
  return Object.fromEntries(merged) as Doc;
}
