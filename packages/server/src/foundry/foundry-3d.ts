import { mediaKind } from '@vtt/core';
import type { Model3D, Solid3D, View3DSettings } from '@vtt/shared';

// 3D Canvas (the levels-3d-preview module) keeps its 3D in flags: a tile's
// model with its height (`depth`, in pixels), tilt, fill and tint; a token's
// figure; a scene's sky and table. They become our `model` and `view3d`
// (docs/view3d.md). Only glTF files that came along are kept.

export type MediaFind = (path: string) => string | undefined;
export type Flags = Record<string, unknown>;

export const flagsOf = (raw: unknown): Flags | undefined => {
  const all = (raw as { flags?: Record<string, unknown> } | undefined)?.flags;
  const mine = all?.['levels-3d-preview'];
  return mine && typeof mine === 'object' ? (mine as Flags) : undefined;
};
export const finite = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
export const text = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/** Our URL for a glTF model the flags name, if it is one and came along. */
function modelFile(path: unknown, find: MediaFind): string | undefined {
  const src = text(path);
  return src && mediaKind(src) === 'model' ? find(src) : undefined;
}

/** A tint other than white. */
const tintOf = (v: unknown) => {
  const color = text(v);
  return color && color.toLowerCase() !== '#ffffff' ? { color } : {};
};

/** How the model fills the tile: stretched to the tile and its depth, or repeated in proportion. */
function fillOf(f: Flags, grid: { size: number; distance: number }): Partial<Model3D> {
  if (f.fillType === 'tile') return { fill: 'tile', piece: finite(f.tileScale) ?? 1 };
  const depth = finite(f.depth);
  return depth ? { height: (depth / grid.size) * 5 } : {};
}

/** The model a 3D Canvas tile shows, if it has a glTF one that came along. */
export function tileModelOf(
  raw: unknown,
  grid: { size: number; distance: number },
  find: MediaFind,
): Model3D | undefined {
  const f = flagsOf(raw);
  const src = f && modelFile(f.model3d, find);
  if (!f || !src) return undefined;
  const tile = raw as { elevation?: unknown; rotation?: unknown };
  const rotation = finite(tile.rotation);
  const elevation = ((finite(tile.elevation) ?? 0) * 5) / grid.distance;
  const tilt: [number, number] = [finite(f.tiltX) ?? 0, finite(f.tiltZ) ?? 0];
  return {
    src,
    ...(elevation && { elevation }),
    ...fillOf(f, grid),
    ...(rotation && { rotation }),
    ...((tilt[0] || tilt[1]) && { tilt }),
    ...tintOf(f.color),
    ...originOf(f),
  };
}

/** 3D Canvas centres a model on its tile and stands it on the ground only when asked; else its own origin is the spot. */
const originOf = (f: Flags): Partial<Model3D> => ({
  ...(f.autoCenter !== true && { center: false }),
  ...(f.autoGround !== true && { ground: false }),
});

/** One copy of a merged tile: its rect from the group's corner, in pixels, and how its model differs. */
export interface MergedCopy {
  rect: { x: number; y: number; w: number; h: number };
  /** Feet above the group's elevation. */
  rise: number;
  model: Partial<Model3D>;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** A copy's turn and tilt, when it has them. */
function turnOf(m: MergedEntry): Partial<Model3D> {
  const tilt: [number, number] = [m.tiltX ?? 0, m.tiltZ ?? 0];
  return { ...(m.rotation ? { rotation: m.rotation } : {}), ...(tilt[0] || tilt[1] ? { tilt } : {}) };
}

/** 3D Canvas's units: 1000 pixels each. */
const UNIT = 1000;

interface MergedEntry {
  width: number;
  height: number;
  depth: number;
  x: number;
  y: number;
  z: number;
  rotation?: number;
  tiltX?: number;
  tiltZ?: number;
  color?: string;
}

const isEntry = (m: unknown): m is MergedEntry =>
  !!m &&
  typeof m === 'object' &&
  ['width', 'height', 'depth', 'x', 'y', 'z'].every((k) => typeof (m as Flags)[k] === 'number');

/**
 * The copies a merged 3D Canvas tile holds ("merge tiles": several copies of
 * one model, the tile only their bounds), each at its own size and spot,
 * scaled with the tile if it was resized after merging. None for a plain tile.
 */
export function mergedCopiesOf(raw: unknown, grid: { size: number; distance: number }): MergedCopy[] | undefined {
  const f = flagsOf(raw);
  const entries = Array.isArray(f?.mergedMatrix) ? f.mergedMatrix.filter(isEntry) : [];
  if (!f || !entries.length) return undefined;
  const tile = raw as { width?: unknown; height?: unknown };
  const was = (f.originalDimensions ?? {}) as Flags;
  const ratio = (now: number | undefined, then: unknown) => (now && finite(then) ? now / (finite(then)! * UNIT) : 1);
  const [sx, sy] = [ratio(finite(tile.width), was.width), ratio(finite(tile.height), was.height)];
  const sd = ratio(finite(f.depth), was.depth);
  const px = (units: number, scale: number) => round(units * UNIT * scale);
  const feet = (units: number) => round((units * UNIT * sd * 5) / grid.size);
  return entries.map((m) => ({
    rect: { x: px(m.x, sx), y: px(m.y, sy), w: px(m.width, sx), h: px(m.height, sy) },
    rise: feet(m.z),
    model: { height: feet(m.depth), ...turnOf(m), ...tintOf(m.color) },
  }));
}

/** The figure a 3D Canvas token stands as, if it has a glTF one that came along. */
export function tokenModelOf(raw: unknown, find: MediaFind): Model3D | undefined {
  const f = flagsOf(raw);
  const src = f && modelFile(f.model3d, find);
  return src ? { src } : undefined;
}

/** 3D Canvas opens the scene in 3D ("Auto 3D"): it is a 3D scene. */
export const is3dScene = (raw: unknown): boolean => flagsOf(raw)?.auto3d === true;

/** A 3D Canvas scene's sky, table colour, whether its walls stand and whether its background picture shows. */
export function scene3dOf(raw: unknown, find: MediaFind): View3DSettings | undefined {
  const f = flagsOf(raw);
  if (!f) return undefined;
  const skyPath = text(f.exr) ?? text(f.skybox);
  const sky = skyPath && mediaKind(skyPath) === 'image' ? find(skyPath) : undefined;
  const ground = f.renderTable === 'none' || f.renderTable === false ? 'none' : colorIn(f.tableColor);
  const out: View3DSettings = {
    ...(sky && { sky }),
    ...(ground && { ground }),
    ...(f.showSceneWalls === false && { walls: false }),
    ...(f.renderBackground === false && { background: false }),
  };
  return Object.keys(out).length ? out : undefined;
}

/** The #rgb or #rrggbb in a colour setting, which old worlds sometimes store wrapped (`default="#000000"`). */
const colorIn = (v: unknown) => /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(text(v) ?? '')?.[0];

/** 3D Canvas's polygon outline ("x,y,x,y,…", maybe after "n#"), as fractions of its own bounds. */
function outlineOf(raw: unknown): [number, number][] | undefined {
  const numbers = (text(raw) ?? '').split('#').at(-1)!.split(',').map(Number);
  if (numbers.length < 6 || numbers.some((n) => !Number.isFinite(n))) return undefined;
  const xs = numbers.filter((_, i) => i % 2 === 0);
  const ys = numbers.filter((_, i) => i % 2 === 1);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  const [w, h] = [Math.max(...xs) - x0 || 1, Math.max(...ys) - y0 || 1];
  const round = (n: number) => Math.round(n * 10000) / 10000;
  return xs.map((x, i) => [round((x - x0) / w), round((ys[i]! - y0) / h)]);
}

const BOX: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
/** A circle across the tile, in 24 corners. */
const ROUND = Array.from({ length: 24 }, (_, i): [number, number] => {
  const a = (i / 24) * 2 * Math.PI;
  return [Math.round((0.5 + Math.cos(a) / 2) * 10000) / 10000, Math.round((0.5 + Math.sin(a) / 2) * 10000) / 10000];
});

/** The outline of a 3D Canvas drawn shape: a box or cylinder filling the tile, or a polygon of its own. */
function shapeOf(f: Flags): [number, number][] | undefined {
  const mesh = String(f.dynaMesh);
  if (mesh === 'box') return BOX;
  if (mesh === 'cylinder') return ROUND;
  return mesh.startsWith('polygon') ? outlineOf(f.model3d) : undefined;
}

/** The solid a 3D Canvas tile draws (a box, a cylinder, a polygon), if it is one. */
export function tileSolidOf(
  raw: unknown,
  grid: { size: number; distance: number },
  find?: MediaFind,
): Solid3D | undefined {
  const f = flagsOf(raw);
  const points = f && shapeOf(f);
  if (!f) return undefined;
  const depth = finite(f.depth);
  if (!points || !depth || depth <= 0) return undefined;
  const tile = raw as { elevation?: unknown; rotation?: unknown };
  const elevation = ((finite(tile.elevation) ?? 0) * 5) / grid.distance;
  const rotation = finite(tile.rotation);
  const color = text(f.color);
  return {
    points,
    height: (depth / grid.size) * 5,
    ...(elevation && { elevation }),
    ...(rotation && { rotation }),
    ...(color && { color }),
    ...(find && pictureOf(f, find)),
  };
}

/** The picture 3D Canvas covers a shape in, and how often it repeats; none for its blank one. */
function pictureOf(f: Flags, find: MediaFind): Pick<Solid3D, 'texture' | 'repeat'> {
  const path = text(f.imageTexture);
  if (!path || path.endsWith('/blankTex.jpg') || mediaKind(path) !== 'image') return {};
  const texture = find(path);
  const repeat = finite(f.textureRepeat);
  return texture ? { texture, ...(repeat && repeat > 0 && repeat !== 1 && { repeat }) } : {};
}
