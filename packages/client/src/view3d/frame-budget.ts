import type { Point, Rect } from '@vtt/shared';

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

/** Whether the ground is drawn again though the camera stayed: poked, or `perSecond` times a second (lights flicker). */
export function groundDue({ sinceDrawn, poked }: { sinceDrawn: number; poked: boolean }, perSecond: number): boolean {
  return poked || sinceDrawn > 1 / perSecond;
}

/** The share of the screen's resolution the 3D view draws at, eased by how long frames take. */
export class Resolution {
  /** Frames slower than this (ms) lower it, quicker than `quick` raise it. */
  private static readonly slow = 24;
  private static readonly quick = 15;
  /** Seconds of slow (or quick) frames before a step. */
  private static readonly settle = { down: 0.5, up: 2 };
  private static readonly step = 0.85;

  scale = 1;

  /** `lowest`: it never drops below this share. */
  constructor(readonly lowest = 0.5) {}

  private average = 16;
  private slowFor = 0;
  private quickFor = 0;

  /** Takes one frame's duration, ms; true when the scale changed. */
  frame(ms: number): boolean {
    const dt = Math.min(ms, 250) / 1000;
    this.average += (ms - this.average) * 0.1;
    this.slowFor = this.average > Resolution.slow ? this.slowFor + dt : 0;
    this.quickFor = this.average < Resolution.quick ? this.quickFor + dt : 0;
    if (this.slowFor > Resolution.settle.down && this.scale > this.lowest) {
      return this.set(Math.max(this.lowest, this.scale * Resolution.step));
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

/**
 * Whether something `size` across (pixels) at `distance` from the camera is
 * too small to draw: it looks smaller than `tiny` (its size over its
 * distance, about radians).
 */
export function tooSmallToSee(size: number, distance: number, grid: number, tiny = 0.015): boolean {
  return distance > NEAR_SQUARES * grid && size / distance < tiny;
}

/** The map the 3D view keeps loaded round the camera: this many squares each way; moved once the camera has gone `move` of that. */
export const REACH = { squares: 60, move: 0.35 } as const;
/** At most this many chunks across (the 2D map's own cap is 24, with a chunk's margin each side). */
const MOST_CHUNKS = 20;

/**
 * The area whose map pieces (chunks) stay loaded round `target`, or undefined
 * while `was` still serves. It is a square round the camera's target, not the
 * ground in sight, so turning the camera never drops pieces that then pop back.
 */
export function chunkArea(
  target: Point,
  sizes: { grid: number; chunkSize: number },
  was: Rect | undefined,
): Rect | undefined {
  const half = Math.min(REACH.squares * sizes.grid, (MOST_CHUNKS * sizes.chunkSize) / 2);
  if (was) {
    const off = Math.max(Math.abs(target[0] - (was.x + was.w / 2)), Math.abs(target[1] - (was.y + was.h / 2)));
    if (off < half * REACH.move) return undefined;
  }
  return { x: target[0] - half, y: target[1] - half, w: 2 * half, h: 2 * half };
}
