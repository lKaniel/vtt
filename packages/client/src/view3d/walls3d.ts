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

/** How a wall shows: a door, glass, a wall, or not at all (open doors, walls you see through). */
function kindOf(w: Wall): WallKind | undefined {
  if (w.door) return w.door === 'open' ? undefined : 'door';
  if (restriction(w, 'sight') !== 'none') return 'wall';
  return (w.move ?? 'normal') !== 'none' && (w.sound ?? 'normal') !== 'none' ? 'window' : undefined;
}

/** The boxes of the walls on a floor. */
export function wallBoxes(walls: readonly Wall[], floor: FloorSpan): WallBox[] {
  const px = floor.grid / 5;
  const ceiling = floor.top ?? floor.bottom + DEFAULT_FEET;
  return walls.flatMap((w): WallBox[] => {
    const kind = kindOf(w);
    const mid: Point = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
    if (!kind || (floor.explored && !floor.explored(mid))) return [];
    const bottom = Math.max(floor.bottom, w.height?.bottom ?? floor.bottom);
    const top = Math.min(ceiling, w.height?.top ?? ceiling);
    const [dx, dy] = [w.b[0] - w.a[0], w.b[1] - w.a[1]];
    const length = Math.hypot(dx, dy);
    if (length < 1 || top <= bottom) return [];
    return [
      {
        mid,
        length,
        angle: Math.atan2(dy, dx),
        bottom: (bottom - floor.bottom) * px,
        height: (top - bottom) * px,
        kind,
      },
    ];
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
