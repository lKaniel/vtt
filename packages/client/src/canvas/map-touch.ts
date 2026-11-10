import type { Point } from '@vtt/shared';
import type { Application, FederatedPointerEvent } from 'pixi.js';
import type { CameraMotion } from './camera-motion.ts';
import { Fingers, LongPress } from './touch-gestures.ts';

// Touch on the 2D map, as on a tablet: a tap is a click, one finger on open
// ground drags the map, two fingers pinch to zoom and pan, and a finger held
// still opens the menu a right click would. Under the 3D view its own camera
// takes the pinch (view3d/input3d.ts); the long press still opens the menu.

export interface TouchHost {
  /** The 2D camera follows two fingers: off under the 3D view. */
  steers(): boolean;
  /** A press or drag in progress is put away: a second finger or a long press took over. */
  dropPress(): void;
  /** The menu of what is under the finger, as a right click there opens. */
  menu(client: Point, screen: Point): void;
  /** The camera moved. */
  moved(): void;
}

const isTouch = (e: FederatedPointerEvent): boolean => e.pointerType === 'touch';

export class MapTouch {
  private fingers = new Fingers();
  private press = new LongPress();
  /** Two fingers have been down since the screen was last let go: no finger is a tap or a drag until then. */
  private pinched = false;

  constructor(
    private app: Application,
    private cam: CameraMotion,
    private host: TouchHost,
  ) {
    const stage = app.stage;
    // Capture runs before tokens and doors take the press for themselves.
    stage.on('pointerdowncapture', (e) => this.down(e));
    stage.on('pointertapcapture', (e) => {
      if (isTouch(e) && (this.press.fired || this.pinched)) e.stopPropagation();
    });
    stage.on('pointercancel', (e) => {
      if (this.up(e)) return;
      this.host.dropPress();
    });
    // No "save picture" bubble on a long press (Safari).
    app.canvas.style.setProperty('-webkit-touch-callout', 'none');
  }

  /** One finger on open ground in this press: it drags the map instead of drawing a marquee. */
  pansFrom(e: FederatedPointerEvent): boolean {
    return isTouch(e) && this.host.steers() && e.target === this.app.stage;
  }

  private down(e: FederatedPointerEvent): void {
    if (!isTouch(e)) return;
    const p: Point = [e.global.x, e.global.y];
    this.fingers.down(e.pointerId, p);
    if (this.fingers.count >= 2) {
      this.pinched = true;
      this.press.cancel();
      this.host.dropPress();
      e.stopPropagation();
      return;
    }
    this.pinched = false;
    const client: Point = [e.client.x, e.client.y];
    this.press.begin(p, () => {
      this.host.dropPress();
      this.host.menu(client, p);
    });
  }

  /** A finger moved: true when the move is the pinch's, not a drag of the map below. */
  move(e: FederatedPointerEvent): boolean {
    if (!isTouch(e)) return false;
    const p: Point = [e.global.x, e.global.y];
    this.press.move(p);
    const pinch = this.fingers.move(e.pointerId, p);
    if (pinch && this.host.steers()) {
      this.cam.pinch(pinch, this.app.screen);
      this.host.moved();
    }
    return this.pinched;
  }

  /** A finger lifted: true when the lift ends a pinch or a long press, not a tap, drag or drop. */
  up(e: FederatedPointerEvent): boolean {
    if (!isTouch(e)) return false;
    this.fingers.up(e.pointerId);
    this.press.cancel();
    return this.pinched || this.press.fired;
  }
}
