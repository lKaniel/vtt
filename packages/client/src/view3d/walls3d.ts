import { type Point, restriction, type Wall } from '@vtt/shared';

// Walls stood up for the 3D view (View3D.ts): a box along each wall that
// stops sight, as tall as its own height says, else up to the floor's
// ceiling. Pure geometry; the boxes become three.js instances.

/** Feet a wall stands when nothing says how tall: two squares. */
const DEFAULT_FEET = 10;

export type WallKind = 'wall' | 'door' | 'window';

export interface WallBox {
  /** Its middle on the map, pixels. */
  mid: Point;
  length: number;
  /** Radians from east, clockwise as the map's y runs south. */
  angle: number;
  /** Where it starts and how tall it is, pixels above the map. */
  bottom: number;
  height: number;
  kind: WallKind;
}

export interface FloorSpan {
  /** Feet: the floor shown and its ceiling (missing: two squares up). */
  bottom: number;
  top?: number;
  grid: number;
  /** For a player: whether they have explored a point; walls elsewhere stay hidden. */
  explored?: (p: Point) => boolean;
}

/** How a wall shows: glass, a wall, or not at all (doors swing on their own, doors3d.ts; walls you see through). */
function kindOf(w: Wall): WallKind | undefined {
  if (w.door) return undefined;
  if (restriction(w, 'sight') !== 'none') return 'wall';
  return (w.move ?? 'normal') !== 'none' && (w.sound ?? 'normal') !== 'none' ? 'window' : undefined;
}

/** A wall's box on a floor, if it stands there and the viewer has explored it. */
function boxOf(w: Wall, kind: WallKind, floor: FloorSpan): WallBox | undefined {
  const px = floor.grid / 5;
  const ceiling = floor.top ?? floor.bottom + DEFAULT_FEET;
  const mid: Point = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
  if (floor.explored && !floor.explored(mid)) return undefined;
  const bottom = Math.max(floor.bottom, w.height?.bottom ?? floor.bottom);
  const top = Math.min(ceiling, w.height?.top ?? ceiling);
  const [dx, dy] = [w.b[0] - w.a[0], w.b[1] - w.a[1]];
  const length = Math.hypot(dx, dy);
  if (length < 1 || top <= bottom) return undefined;
  return {
    mid,
    length,
    angle: Math.atan2(dy, dx),
    bottom: (bottom - floor.bottom) * px,
    height: (top - bottom) * px,
    kind,
  };
}

/** The boxes of the walls on a floor. */
export function wallBoxes(walls: readonly Wall[], floor: FloorSpan): WallBox[] {
  return walls.flatMap((w) => {
    const kind = kindOf(w);
    const box = kind && boxOf(w, kind, floor);
    return box ? [box] : [];
  });
}

/** A door as its leaf: hinged at its wall's first end, open or shut. */
export interface DoorBox extends WallBox {
  id: string;
  a: Point;
  open: boolean;
}

/** The doors on a floor as leaves, open or shut, but those a model moves (`moved`: their wall ids). */
export function doorBoxes(walls: readonly Wall[], floor: FloorSpan, moved: ReadonlySet<string>): DoorBox[] {
  return walls.flatMap((w) => {
    const box = w.door && !moved.has(w.id) ? boxOf(w, 'door', floor) : undefined;
    return box ? [{ ...box, id: w.id, a: w.a, open: w.door === 'open' }] : [];
  });
}

export interface Cut {
  target: Point;
  yaw: number;
  /** Pixels round the target within which walls on the camera's side are cut. */
  radius: number;
  /** How tall a cut wall stays, pixels. */
  low: number;
}

/** BG3's cutaway: walls on the camera's side of the target, near it, stand only `low` high. */
export function cutaway(boxes: readonly WallBox[], cut: Cut): WallBox[] {
  const toward: Point = [Math.sin(cut.yaw), Math.cos(cut.yaw)];
  return boxes.map((b) => {
    const off: Point = [b.mid[0] - cut.target[0], b.mid[1] - cut.target[1]];
    const facing = off[0] * toward[0] + off[1] * toward[1];
    const near = Math.hypot(...off) < cut.radius;
    return facing > 0 && near ? { ...b, height: Math.min(b.height, cut.low) } : b;
  });
}
