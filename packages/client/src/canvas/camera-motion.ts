import type { Point } from '@vtt/shared';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 3;
/** How quickly zoom and glides close the gap to their target, per second. */
const EASE = 14;
/** How quickly a fling slows down, per second. */
const FRICTION = 5;
/** Speeds below this (screen pixels per second) count as stopped. */
const REST = 8;

interface Screen {
  width: number;
  height: number;
}

/**
 * The camera's movement: zoom eases toward where the wheel asked for and
 * keeps the point under the cursor still, a fling of the map glides on and
 * slows down, and the camera can glide to a point. Pure maths; the map view
 * reads `center` and `zoom` every frame.
 */
export class CameraMotion {
  private targetZoom: number;
  private anchor?: { screen: Point; world: Point; size: Screen };
  private velocity: Point = [0, 0];
  private gliding = false;
  private goal?: Point;

  constructor(
    public center: Point,
    public zoom: number,
  ) {
    this.targetZoom = zoom;
  }

  screenToWorld([x, y]: Point, size: Screen): Point {
    return [this.center[0] + (x - size.width / 2) / this.zoom, this.center[1] + (y - size.height / 2) / this.zoom];
  }

  /** Zoom toward `zoom`, keeping what is under `screen` where it is. */
  zoomAt(zoom: number, screen: Point, size: Screen): void {
    this.targetZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    this.anchor = { screen, world: this.screenToWorld(screen, size), size };
  }

  get zoomGoal(): number {
    return this.targetZoom;
  }

  /** The map was dragged by `delta` screen pixels over `dt` seconds. */
  drag(delta: Point, dt: number): void {
    this.goal = undefined;
    this.gliding = false;
    const move: Point = [-delta[0] / this.zoom, -delta[1] / this.zoom];
    this.center = [this.center[0] + move[0], this.center[1] + move[1]];
    const k = dt > 0 ? 1 / Math.max(dt, 1 / 120) : 0;
    this.velocity = [move[0] * k, move[1] * k];
  }

  /** Let go after a drag: the map glides on with the speed it had. */
  release(): void {
    this.gliding = Math.hypot(...this.velocity) * this.zoom > REST;
  }

  /** Stop any glide (a click without a drag). */
  hold(): void {
    this.gliding = false;
    this.velocity = [0, 0];
  }

  glideTo(p: Point): void {
    this.goal = [...p];
    this.gliding = false;
  }

  /** Jump straight to a point and zoom. */
  jumpTo(p: Point, zoom = this.zoom): void {
    this.center = [...p];
    this.zoom = this.targetZoom = zoom;
    this.goal = this.anchor = undefined;
    this.hold();
  }

  /** Advances by `dt` seconds; true while the camera is still moving. */
  step(dt: number): boolean {
    const zooming = this.stepZoom(dt);
    const flinging = this.stepFling(dt);
    const going = this.stepGoal(dt);
    return zooming || flinging || going;
  }

  private stepZoom(dt: number): boolean {
    if (this.zoom === this.targetZoom) return false;
    const t = 1 - Math.exp(-EASE * dt);
    this.zoom += (this.targetZoom - this.zoom) * t;
    if (Math.abs(this.zoom - this.targetZoom) < this.targetZoom * 1e-4) this.zoom = this.targetZoom;
    const a = this.anchor;
    if (a) {
      const now = this.screenToWorld(a.screen, a.size);
      this.center = [this.center[0] + a.world[0] - now[0], this.center[1] + a.world[1] - now[1]];
    }
    return true;
  }

  private stepFling(dt: number): boolean {
    if (!this.gliding) return false;
    this.center = [this.center[0] + this.velocity[0] * dt, this.center[1] + this.velocity[1] * dt];
    const k = Math.exp(-FRICTION * dt);
    this.velocity = [this.velocity[0] * k, this.velocity[1] * k];
    if (Math.hypot(...this.velocity) * this.zoom < REST) this.hold();
    return true;
  }

  private stepGoal(dt: number): boolean {
    const g = this.goal;
    if (!g) return false;
    const t = 1 - Math.exp(-EASE * 0.5 * dt);
    this.center = [this.center[0] + (g[0] - this.center[0]) * t, this.center[1] + (g[1] - this.center[1]) * t];
    if (Math.hypot(g[0] - this.center[0], g[1] - this.center[1]) * this.zoom < 0.5) {
      this.center = [...g];
      this.goal = undefined;
    }
    return true;
  }
}
