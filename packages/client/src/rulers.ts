import type { Point, RulerMeasure } from '@vtt/shared';
import { BROWSER, Throttle, type Timing } from './throttle.ts';

// The rulers on the map: yours, laid click by click and following the
// pointer, and the ones the others on your scene are laying, as the server
// passes them on. Yours goes to the table at most every `interval` ms while
// the pointer moves, and at once when a waypoint is added or taken back.

/** Someone else's ruler, as the server shows it. */
export interface ShownRuler {
  player: string;
  name: string;
  color: string;
  points: Point[];
}

export const whole = (p: Point): Point => [Math.round(p[0]), Math.round(p[1])];

export class Rulers {
  readonly others = new Map<string, ShownRuler>();
  /** Your waypoints so far. */
  private laid: Point[] = [];
  /** Where your ruler ends now: the pointer. */
  private end?: Point;
  private throttle: Throttle;

  constructor(
    send: (msg: { t: 'ruler'; points: Point[] }) => void,
    private changed: () => void,
    timing: Timing = BROWSER,
  ) {
    this.throttle = new Throttle(() => send({ t: 'ruler', points: this.mine }), timing);
  }

  /** Your ruler is out. */
  get active(): boolean {
    return this.laid.length > 0;
  }

  /** Your ruler as it shows: the waypoints, then the pointer. */
  get mine(): Point[] {
    const last = this.laid.at(-1);
    const moved = this.end && last && (this.end[0] !== last[0] || this.end[1] !== last[1]);
    return moved ? [...this.laid, this.end!] : [...this.laid];
  }

  /** A click: starts the ruler there, or adds a waypoint. */
  press(p: Point): void {
    const at = whole(p);
    this.laid.push(at);
    this.end = at;
    this.update(true);
  }

  /** The pointer moved: the ruler's end follows it. */
  hover(p: Point): void {
    if (!this.active) return;
    this.end = whole(p);
    this.update(false);
  }

  /** Takes back the last waypoint (the start too, putting the ruler away); false if there was no ruler. */
  back(): boolean {
    if (!this.active) return false;
    this.laid.pop();
    if (!this.laid.length) this.end = undefined;
    this.update(true);
    return true;
  }

  /** Puts your ruler away; false if it wasn't out. */
  clear(): boolean {
    if (!this.active) return false;
    this.laid = [];
    this.end = undefined;
    this.update(true);
    return true;
  }

  /** Someone else laid or put away their ruler. */
  receive(msg: ShownRuler): void {
    if (msg.points.length) this.others.set(msg.player, msg);
    else this.others.delete(msg.player);
    this.changed();
  }

  /** A fresh start (joining, a new scene): no rulers, and nothing to tell the table. */
  reset(): void {
    this.laid = [];
    this.end = undefined;
    this.others.clear();
    this.changed();
  }

  private update(now: boolean): void {
    this.changed();
    this.throttle.update(now);
  }
}

/** A label on a ruler: where, what it says, and whether it goes beyond the speed it was measured against. */
export interface RulerLabel {
  at: Point;
  text: string;
  over: boolean;
}

/**
 * The feet so far at each waypoint, and at the end the whole length, with
 * what walking it costs when difficult ground makes that more, out of `limit`
 * (a creature's speed, or the movement left this turn) when there is one.
 */
export function rulerLabels(m: RulerMeasure, limit?: number): RulerLabel[] {
  if (!m.legs.length) return [];
  let sum = 0;
  const along = m.legs.slice(0, -1).map((leg) => {
    sum += leg.feet;
    return { at: leg.to, text: `${sum} ft`, over: false };
  });
  const end = m.legs.at(-1)!.to;
  const known = limit !== undefined && Number.isFinite(limit);
  return [...along, { at: end, text: totalText(m, known ? limit : undefined), over: known && m.cost > limit }];
}

/** "45 ft", "45 / 60 ft" against a speed, "45 ft · 60 ft to walk" across difficult ground. */
function totalText(m: RulerMeasure, limit?: number): string {
  const walk = limit === undefined ? `${m.cost} ft` : `${m.cost} / ${limit} ft`;
  if (m.cost !== m.feet) return `${m.feet} ft · ${walk} to walk`;
  return limit === undefined ? `${m.feet} ft` : walk;
}
