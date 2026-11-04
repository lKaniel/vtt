import type { Point } from '@vtt/shared';
import type { Application } from 'pixi.js';
import type { CameraMotion } from '../canvas/camera-motion.ts';

// The 2D map (canvas/MapView.ts) keeps doing everything while the 3D view is
// on: it draws the ground, light and fog into its own canvas, which the 3D
// view lays on the floor; and it still takes every click. Its canvas is
// hidden and square, its camera follows the 3D one, and pointer events on
// the 3D canvas reach it at the map point under the pointer (`pick`).

/** What the bridge needs of the 2D map. */
export interface FlatMap {
  readonly app: Application;
  readonly cam: CameraMotion;
  dirty: boolean;
  /** Empty ground stays see-through (on) or gets the void colour. */
  seeThrough(on: boolean): void;
}

/** Side of the square the 2D map draws for the 3D view, pixels. */
const GROUND_PIXELS = 2048;

interface Saved {
  resizeTo: unknown;
  display: string;
  /** The flat map's zoom, to go back to (the 3D view zooms it to its square of ground). */
  zoom: number;
}

export class PixiBridge {
  private saved?: Saved;

  /** `pick`: the map point under a pointer at these client coordinates. */
  constructor(
    private readonly map: FlatMap,
    private readonly pick: (clientX: number, clientY: number) => Point,
  ) {}

  /** The 2D map draws a square offscreen and listens to `surface` instead of its own canvas. */
  attach(surface: HTMLElement): void {
    const { app } = this.map;
    const resizable = app as unknown as { resizeTo: unknown };
    this.saved = { resizeTo: resizable.resizeTo, display: app.canvas.style.display, zoom: this.map.cam.zoom };
    resizable.resizeTo = null;
    app.renderer.resize(GROUND_PIXELS, GROUND_PIXELS, 1);
    app.canvas.style.display = 'none';
    this.map.seeThrough(true);
    const events = app.renderer.events;
    events.mapPositionToPoint = (point, x, y) => {
      const [sx, sy] = this.toScreen(this.pick(x, y));
      point.x = sx;
      point.y = sy;
    };
    events.setTargetElement(surface);
  }

  /** Back to the plain 2D map. */
  detach(host: HTMLElement): void {
    const saved = this.saved;
    if (!saved) return;
    const { app } = this.map;
    const events = app.renderer.events as unknown as Record<string, unknown>;
    delete events.mapPositionToPoint;
    app.renderer.events.setTargetElement(app.canvas);
    app.canvas.style.display = saved.display;
    this.map.seeThrough(false);
    (app as unknown as { resizeTo: unknown }).resizeTo = saved.resizeTo ?? host;
    app.resize();
    // Back over the ground the 3D view looked at, as close as the flat map was.
    this.map.cam.jumpTo(this.map.cam.center, saved.zoom);
    this.map.dirty = true;
    this.saved = undefined;
  }

  /** Points the 2D camera at the square of ground the 3D camera sees. */
  frame(center: Point, half: number): void {
    const zoom = GROUND_PIXELS / (2 * half);
    const cam = this.map.cam;
    const moved = Math.abs(cam.center[0] - center[0]) + Math.abs(cam.center[1] - center[1]) > 0.5;
    if (!moved && Math.abs(cam.zoom - zoom) < zoom * 1e-3) return;
    cam.jumpTo(center, zoom);
    this.map.dirty = true;
  }

  /** Where a map point is on the 2D map's (offscreen) canvas. */
  private toScreen([x, y]: Point): Point {
    const cam = this.map.cam;
    return [(x - cam.center[0]) * cam.zoom + GROUND_PIXELS / 2, (y - cam.center[1]) * cam.zoom + GROUND_PIXELS / 2];
  }
}
