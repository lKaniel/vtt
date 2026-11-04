import { mediaKind } from '@vtt/core';
import type { Terrain3D } from '@vtt/shared';
import { type Flags, flagsOf, type MediaFind, finite, text } from './foundry-3d.ts';

// 3D Canvas terrain (levels-3d-preview 9.x, tile3d.js): a box tile with a
// `displacementMap` has every vertex above its bottom raised by the
// picture's red, then is stretched so its highest peak stands `depth` times
// `displacementIntensity` up;
// `displacementMatrix` "a,b,c,d" reads the picture at u' = a + u/c, v' =
// b + v/d. Its textureGradient shader paints up to four pictures by height
// (or by flatness with useNormals), its mask shader one more where a mask
// picture is white. A "mapGen" tile without map data falls
// back to that box. It becomes our tile `terrain` (shared terrain3d.ts).

interface Grid {
  size: number;
  distance: number;
}

/** The flags' heightmap, if this tile is terrain and the picture came along. */
function heightmapOf(f: Flags, find: MediaFind): string | undefined {
  const box = f.dynaMesh === 'box' || (f.dynaMesh === 'mapGen' && !f.mapgen);
  const path = text(f.displacementMap);
  if (!box || !path || mediaKind(path) !== 'image') return undefined;
  return find(path);
}

/** "a,b,c,d" as the part of the picture read; none for the whole of it. */
function windowOf(v: unknown): Terrain3D['window'] {
  const [a = 0, b = 0, c = 1, d = 1] = (text(v) ?? '').split(',').map(Number);
  const w: [number, number, number, number] = [a || 0, b || 0, c > 0 ? c : 1, d > 0 ? d : 1];
  return w.join() === '0,0,1,1' ? undefined : w;
}

const white = (c: unknown) => !text(c) || String(c).toLowerCase() === '#ffffff';

/** The textureGradient's layers that are on, each with the picture that came along. */
function layersOf(f: Flags, find: MediaFind): Pick<Terrain3D, 'layers' | 'blend' | 'bySlope'> {
  const g = ((f.shaders as Flags | undefined)?.textureGradient ?? {}) as Flags;
  if (g.enabled !== true) return {};
  const count = Math.min(4, Math.max(1, finite(g.texCount) ?? 1));
  const layers = Array.from({ length: count }, (_, i) => {
    const path = text(g[`textureDiffuse${i}`]);
    const src = path && mediaKind(path) === 'image' ? find(path) : undefined;
    const repeat = finite(g[`repeat${i}`]);
    return {
      ...(src && { src }),
      ...(!white(g[`color${i}`]) && { color: String(g[`color${i}`]) }),
      ...(repeat && repeat !== 1 && repeat > 0 && { repeat }),
      from: Math.min(1, Math.max(0, finite(g[`tex${i}Begin`]) ?? i * 0.25)),
    };
  });
  const blend = Math.min(0.25, Math.max(0, finite(g.smoothing) ?? 0.1));
  return { layers, blend, ...(g.useNormals === true && { bySlope: true }) };
}

/** The ground a 3D Canvas terrain tile raises, if it is one and its heightmap came along. */
export function tileTerrainOf(raw: unknown, grid: Grid, find: MediaFind): Terrain3D | undefined {
  const f = flagsOf(raw);
  const heightmap = f && heightmapOf(f, find);
  const depth = f && finite(f.depth);
  if (!f || !heightmap || !depth || depth <= 0) return undefined;
  const strength = finite(f.displacementIntensity);
  const height = ((depth * (strength && strength > 0 ? strength : 1)) / grid.size) * 5;
  const mask = maskOf(f, find);
  return {
    heightmap,
    ...readOf(f),
    height,
    ...placeOf(raw, f, height, grid),
    ...(!white(f.color) && { color: String(f.color) }),
    ...layersOf(f, find),
    ...(mask && { mask }),
  };
}

/** The picture at `path`, if it is one and came along. */
const pictureAt = (path: string | undefined, find: MediaFind) =>
  path && mediaKind(path) === 'image' ? find(path) : undefined;

/** The mask shader's picture and where it shows, if it is on and its mask came along. */
function maskOf(f: Flags, find: MediaFind): Terrain3D['mask'] {
  const m = ((f.shaders as Flags | undefined)?.mask ?? {}) as Flags;
  const map = m.enabled === true ? pictureAt(text(m.textureMask), find) : undefined;
  if (!map) return undefined;
  const src = pictureAt(text(m.textureDiffuse), find);
  const repeat = finite(m.repeat) ?? 1;
  return {
    map,
    ...(src && { src }),
    ...(!white(m.color) && { color: String(m.color) }),
    ...(repeat !== 1 && repeat > 0 && { repeat }),
  };
}

/** How the picture is read: its window, which way is high, how fine. */
function readOf(f: Flags): Partial<Terrain3D> {
  const window = windowOf(f.displacementMatrix);
  const detail = finite(f.dynaMeshResolution);
  return {
    ...(window && { window }),
    ...(f.invertDisplacementMap === true && { highIsWhite: true }),
    ...(detail && detail > 0 && detail !== 1 && { detail }),
  };
}

/** Its bottom's elevation and its turn. */
function placeOf(raw: unknown, f: Flags, height: number, grid: Grid): Partial<Terrain3D> {
  const tile = raw as { elevation?: unknown; rotation?: unknown };
  const base = ((finite(tile.elevation) ?? 0) * 5) / grid.distance;
  // Ungrounded, 3D Canvas stretches it about its middle: it spans its elevation ± half its height.
  const elevation = f.autoGround === true ? base : base - height / 2;
  const rotation = finite(tile.rotation);
  return { ...(elevation && { elevation }), ...(rotation && { rotation }) };
}
