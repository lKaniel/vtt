import type { Point } from '@vtt/shared';
import type { CameraSteer } from './input3d.ts';
import { follow, type MapPoint, type Orbit, panBy, rotateBy, tiltBy, zoomBy } from './orbit.ts';

// Where the 3D camera looks, as in BG3: it keeps with the creature you act
// with, turning round it; W A S D or a right drag take it away to look
// round, and it comes back once that creature moves, you pick another, or
// press Home (orbit.ts has the camera's maths, View3D.ts applies it).

/** Whether the camera keeps with your creature. */
export class Follow {
  private on = true;
  private id?: string;
  private at?: Point;

  /** Notes the creature you act with and where it is; true while the camera should keep with it. */
  watch(id: string | undefined, at: Point | undefined): boolean {
    if (id !== this.id) {
      this.id = id;
      this.on = true;
    } else if (at && this.at && Math.hypot(at[0] - this.at[0], at[1] - this.at[1]) > 1) this.on = true;
    this.at = at;
    return this.on && !!at;
  }

  /** You moved the camera yourself: it stays until the creature moves. */
  leave(): void {
    this.on = false;
  }

  /** Back to the creature (Home, or it was picked again). */
  back(): void {
    this.on = true;
  }
}

/** Squares a second the keys move the camera at least, and per square of its distance. */
const GLIDE = { least: 10, perDistance: 1.4 };

/** How far `way` ([right, down the screen], each -1..1) moves the camera in `dt` seconds: [right, down], pixels. */
export function glideBy(way: Point, dt: number, at: { distance: number; grid: number }): Point {
  const speed = Math.max(GLIDE.least * at.grid, GLIDE.perDistance * at.distance);
  const n = Math.hypot(way[0], way[1]) || 1;
  return [(way[0] / n) * speed * dt, (way[1] / n) * speed * dt];
}

/** What the rig needs to know of the view: a square's pixels, the picture's height, the lens. */
interface RigView {
  grid(): number;
  /** The 3D picture's height on screen, CSS pixels. */
  height(): number;
  fov: number;
}

/** The 3D camera: the orbit (orbit.ts) and whether it keeps with your creature, steered by CameraInput. */
export class CameraRig {
  orbit: Orbit;
  private follows = new Follow();

  constructor(
    private readonly view: RigView,
    private readonly home: () => MapPoint,
  ) {
    this.orbit = this.fresh();
  }

  /** The controls' effect on the camera (input3d.ts); `toggle` lays the scene flat. */
  steer(toggle: () => void): CameraSteer {
    const grid = () => this.view.grid();
    return {
      zoom: (n) => (this.orbit = zoomBy(this.orbit, n, grid())),
      turn: (r) => (this.orbit = rotateBy(this.orbit, r)),
      tilt: (r) => (this.orbit = tiltBy(this.orbit, r, grid())),
      pan: (by) => this.pan(by),
      glide: (way, dt) => this.glide(way, dt),
      tactical: () => (this.orbit = { ...this.orbit, tactical: !this.orbit.tactical }),
      centre: () => this.follows.back(),
      toggle,
    };
  }

  /** Back to your creature (it was picked again). */
  back(): void {
    this.follows.back();
  }

  /** Keeps with creature `id` standing at `at`, its feet at `feet`; true while it does. */
  keepWith(id: string | undefined, at: Point | undefined, feet: number, dt: number): boolean {
    if (!this.follows.watch(id, at) || !at) return false;
    this.orbit = follow(this.orbit, [at[0], at[1], feet], dt);
    return true;
  }

  /** Looks at the ground `height` gives under the target (when it follows no one). */
  settle(height: (x: number, y: number) => number): void {
    const [x, y] = this.orbit.target;
    this.orbit = { ...this.orbit, target: [x, y, height(x, y)] };
  }

  /** Starts over at home (the scene's start), looking as it does at first. */
  goHome(): void {
    this.orbit = this.fresh();
  }

  /** A camera that lost its way (no number anywhere) goes back home. */
  keepInBounds(): void {
    const o = this.orbit;
    if (![...o.target, o.yaw, o.distance, o.tilt ?? 0].every(Number.isFinite)) this.orbit = this.fresh();
  }

  private fresh(): Orbit {
    return { target: this.home(), yaw: 0, distance: 14 * this.view.grid(), tactical: false };
  }

  /** A right drag moves the camera over the ground, as far as the ground under the pointer moved. */
  private pan(by: Point): void {
    this.follows.leave();
    const lens = 2 * this.orbit.distance * Math.tan((this.view.fov * Math.PI) / 360);
    const perPixel = lens / Math.max(1, this.view.height());
    this.orbit = panBy(this.orbit, [-by[0] * perPixel, -by[1] * perPixel]);
  }

  /** W A S D held move the camera, faster the farther out it is. */
  private glide(way: Point, dt: number): void {
    this.follows.leave();
    this.orbit = panBy(this.orbit, glideBy(way, dt, { distance: this.orbit.distance, grid: this.view.grid() }));
  }
}
