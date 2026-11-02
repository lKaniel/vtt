// A hit point bar that moves like a game's: a hit waits for the blow to land,
// the bar drops quickly, and a pale trail drains down to it a moment later.

/** Longest a change waits for its blow before it shows anyway, ms. */
export const HOLD_MAX = 900;
/** How long the trail stays put after the bar drops, ms. */
export const TRAIL_DELAY = 450;
/** Share of the gap the bar closes each millisecond. */
const BAR_RATE = 0.025;
/** How fast the trail drains, share of the bar per millisecond. */
const TRAIL_SPEED = 0.0008;
const EPSILON = 0.002;

export class BarTween {
  shown: number;
  trail: number;
  private target: number;
  private holdUntil = -Infinity;
  private trailFrom = -Infinity;
  private last?: number;

  constructor(value: number) {
    this.shown = this.trail = this.target = value;
  }

  /** The value changed at `now`; it waits for `release` (or HOLD_MAX) before moving. */
  set(value: number, now: number): void {
    if (value === this.target) return;
    this.target = value;
    this.holdUntil = now + HOLD_MAX;
  }

  /** Shows the value at once, e.g. for a token seen for the first time. */
  jump(value: number): void {
    this.shown = this.trail = this.target = value;
    this.holdUntil = -Infinity;
  }

  /** The blow landed: start moving. */
  release(now: number): void {
    if (this.holdUntil <= now) return;
    this.holdUntil = now;
  }

  /** Advances to `now` (ms); true while the bar is still moving or waiting. */
  step(now: number): boolean {
    const dt = this.last === undefined ? 0 : now - this.last;
    this.last = now;
    if (now < this.holdUntil) return true;
    if (this.holdUntil > this.trailFrom) this.trailFrom = this.holdUntil + TRAIL_DELAY;
    this.moveBar(dt);
    this.moveTrail(dt, now);
    return this.shown !== this.target || this.trail !== this.shown;
  }

  private moveBar(dt: number): void {
    const gap = this.target - this.shown;
    this.shown = Math.abs(gap) < EPSILON ? this.target : this.shown + gap * Math.min(1, dt * BAR_RATE);
  }

  private moveTrail(dt: number, now: number): void {
    if (this.trail <= this.shown) {
      this.trail = this.shown;
      return;
    }
    if (now < this.trailFrom) return;
    this.trail = Math.max(this.shown, this.trail - dt * TRAIL_SPEED);
  }
}
