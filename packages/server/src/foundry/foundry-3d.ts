import { mediaKind } from '@vtt/core';
import type { Model3D, View3DSettings } from '@vtt/shared';

// 3D Canvas (the levels-3d-preview module) keeps its 3D in flags: a tile's
// model with its height (`depth`, in pixels), tilt, fill and tint; a token's
// figure; a scene's sky and table. They become our `model` and `view3d`
// (docs/view3d.md). Only glTF files that came along are kept.

type MediaFind = (path: string) => string | undefined;
type Flags = Record<string, unknown>;

const flagsOf = (raw: unknown): Flags | undefined => {
  const all = (raw as { flags?: Record<string, unknown> } | undefined)?.flags;
  const mine = all?.['levels-3d-preview'];
  return mine && typeof mine === 'object' ? (mine as Flags) : undefined;
};
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const text = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

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
  if (f.fillType === 'tile') return { fill: 'tile', piece: num(f.tileScale) ?? 1 };
  const depth = num(f.depth);
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
  const rotation = num(tile.rotation);
  const elevation = ((num(tile.elevation) ?? 0) * 5) / grid.distance;
  const tilt: [number, number] = [num(f.tiltX) ?? 0, num(f.tiltZ) ?? 0];
  return {
    src,
    ...(elevation && { elevation }),
    ...fillOf(f, grid),
    ...(rotation && { rotation }),
    ...((tilt[0] || tilt[1]) && { tilt }),
    ...tintOf(f.color),
  };
}

/** The figure a 3D Canvas token stands as, if it has a glTF one that came along. */
export function tokenModelOf(raw: unknown, find: MediaFind): Model3D | undefined {
  const f = flagsOf(raw);
  const src = f && modelFile(f.model3d, find);
  return src ? { src } : undefined;
}

/** A 3D Canvas scene's sky, table colour and whether its walls stand. */
export function scene3dOf(raw: unknown, find: MediaFind): View3DSettings | undefined {
  const f = flagsOf(raw);
  if (!f) return undefined;
  const skyPath = text(f.exr) ?? text(f.skybox);
  const sky = skyPath && mediaKind(skyPath) === 'image' ? find(skyPath) : undefined;
  const ground = text(f.tableColor);
  const out: View3DSettings = {
    ...(sky && { sky }),
    ...(ground && { ground }),
    ...(f.showSceneWalls === false && { walls: false }),
  };
  return Object.keys(out).length ? out : undefined;
}
