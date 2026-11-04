import type { Point } from '@vtt/shared';

// What the 3D view saves each frame (View3D.ts). The 2D map draws the ground
// picture only when the camera leaves the square it drew last, or something
// on it may have moved (a poke: the pointer, a change on the map), and a few
// times a second for what flickers. The 3D picture drops resolution while
// frames are slow, as games do, and climbs back once they are quick. Small
// things far off are left out.

/** A square of ground: its centre and half its side, map pixels. */
export interface Square {
  center: Point;
  half: number;
}

export const GROUND = {
  /** The square drawn is this much bigger than the one seen. */
  margin: 1.25,
  /** Drawn again, sharper, once the square seen is this much smaller than the one drawn. */
  sharper: 1.6,
  /** Seconds between drawings while nothing pokes it (lights flicker, effects play). */
  refresh: 1 / 15,
} as const;

/** The square to draw now so that `need` shows, or undefined while the square `drawn` still covers it well. */
export function groundToDraw(need: Square, drawn: Square | undefined): Square | undefined {
  const fresh = { center: need.center, half: need.half * GROUND.margin };
  if (!drawn) return fresh;
  const room = drawn.half - need.half;
  const off = Math.max(Math.abs(need.center[0] - drawn.center[0]), Math.abs(need.center[1] - drawn.center[1]));
  if (room < 0 || off > room) return fresh;
  if (need.half * GROUND.sharper < drawn.half) return fresh;
  return undefined;
}

/** Whether the ground is drawn again though the camera stayed. */
export function groundDue({ sinceDrawn, poked }: { sinceDrawn: number; poked: boolean }): boolean {
  return poked || sinceDrawn > GROUND.refresh;
}

/** The share of the screen's resolution the 3D view draws at, eased by how long frames take. */
export class Resolution {
  /** Never below this share. */
  static readonly lowest = 0.5;
  /** Frames slower than this (ms) lower it, quicker than `quick` raise it. */
  private static readonly slow = 24;
  private static readonly quick = 15;
  /** Seconds of slow (or quick) frames before a step. */
  private static readonly settle = { down: 0.5, up: 2 };
  private static readonly step = 0.85;

  scale = 1;
  private average = 16;
  private slowFor = 0;
  private quickFor = 0;

  /** Takes one frame's duration, ms; true when the scale changed. */
  frame(ms: number): boolean {
    const dt = Math.min(ms, 250) / 1000;
    this.average += (ms - this.average) * 0.1;
    this.slowFor = this.average > Resolution.slow ? this.slowFor + dt : 0;
    this.quickFor = this.average < Resolution.quick ? this.quickFor + dt : 0;
    if (this.slowFor > Resolution.settle.down && this.scale > Resolution.lowest) {
      return this.set(Math.max(Resolution.lowest, this.scale * Resolution.step));
    }
    if (this.quickFor > Resolution.settle.up && this.scale < 1)
      return this.set(Math.min(1, this.scale / Resolution.step));
    return false;
  }

  private set(scale: number): boolean {
    this.scale = scale > 0.99 ? 1 : scale;
    this.slowFor = this.quickFor = 0;
    return true;
  }
}

/** Nothing this close (squares) is left out. */
const NEAR_SQUARES = 15;
/** Things that look smaller than this (their size over their distance, about radians) are left out. */
const TINY = 0.015;

/** Whether something `size` across (pixels) at `distance` from the camera is too small to draw. */
export function tooSmallToSee(size: number, distance: number, grid: number): boolean {
  return distance > NEAR_SQUARES * grid && size / distance < TINY;
}
