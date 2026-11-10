import type { Point } from '@vtt/shared';

// Fingers on a touch screen: two of them pinch (zoom, pan and twist the
// camera), and one held still is a long press, the touch screen's right
// click. Pure bookkeeping; the 2D map (map-touch.ts) and the 3D camera
// (view3d/input3d.ts) say what a pinch or a long press does.

/** How two fingers moved since the last move: `scale` > 1 spread apart, `pan` and `centre` in screen pixels, `turn` in radians. */
export interface Pinch {
  scale: number;
  centre: Point;
  pan: Point;
  turn: number;
}

const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const span = (a: Point, b: Point): number => Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1]));
const angle = (a: Point, b: Point): number => Math.atan2(b[1] - a[1], b[0] - a[0]);

/** The pinch from one place of two fingers to the next. */
function pinchBetween(before: [Point, Point], after: [Point, Point]): Pinch {
  const [m0, m1] = [mid(...before), mid(...after)];
  let turn = angle(...after) - angle(...before);
  if (turn > Math.PI) turn -= 2 * Math.PI;
  if (turn < -Math.PI) turn += 2 * Math.PI;
  return { scale: span(...after) / span(...before), centre: m1, pan: [m1[0] - m0[0], m1[1] - m0[1]], turn };
}

/** The fingers down, by pointer id. */
export class Fingers {
  private at = new Map<number, Point>();

  get count(): number {
    return this.at.size;
  }

  down(id: number, p: Point): void {
    this.at.set(id, p);
  }

  up(id: number): void {
    this.at.delete(id);
  }

  /** A finger moved: the pinch it made, while two fingers are down. */
  move(id: number, p: Point): Pinch | undefined {
    if (!this.at.has(id)) return undefined;
    const before = this.pair();
    this.at.set(id, p);
    const after = this.pair();
    return before && after ? pinchBetween(before, after) : undefined;
  }

  private pair(): [Point, Point] | undefined {
    const [a, b] = [...this.at.values()];
    return a && b ? [a, b] : undefined;
  }
}

/** A finger held this long (ms) without wandering is a long press. */
export const LONG_PRESS_MS = 500;
/** Screen pixels a finger may wander and still be held still. */
const LONG_PRESS_SLOP = 10;

/** Times one finger's press: `fire` runs if it stays put long enough. */
export class LongPress {
  private timer?: ReturnType<typeof setTimeout>;
  private start?: Point;
  /** The last press fired: its lift is not a tap. */
  fired = false;

  begin(p: Point, fire: () => void): void {
    this.cancel();
    this.fired = false;
    this.start = p;
    this.timer = setTimeout(() => {
      this.timer = this.start = undefined;
      this.fired = true;
      fire();
    }, LONG_PRESS_MS);
  }

  move(p: Point): void {
    const s = this.start;
    if (s && Math.hypot(p[0] - s[0], p[1] - s[1]) > LONG_PRESS_SLOP) this.cancel();
  }

  cancel(): void {
    clearTimeout(this.timer);
    this.timer = this.start = undefined;
  }
}
