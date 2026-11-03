import type { Point } from '@vtt/shared';
import { actionOf, currentKeys } from '../keys/keybinds.ts';

// The 3D camera's own controls, as in BG3: the wheel zooms (and tilts), a
// middle drag turns the camera round, a right drag moves it, and keys turn
// it, look straight down, or go back to your creature. Left clicks (and a
// right click that doesn't move) go on to the map below (pixi-bridge.ts).

/** What the controls do to the camera. */
export interface CameraSteer {
  zoom(notches: number): void;
  turn(radians: number): void;
  /** Screen pixels the view was dragged by. */
  pan(by: Point): void;
  tactical(): void;
  centre(): void;
  /** The 3D view on or off. */
  toggle(): void;
}

/** Radians per pixel of a middle drag, and per second while a turn key is held. */
const TURN_PER_PIXEL = 0.006;
const TURN_PER_SECOND = 1.8;
/** A right press that moves less than this is a click (the map's menu). */
const DRAG_PIXELS = 5;

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export class CameraInput {
  private drag?: { button: number; last: Point; start: Point; moved: boolean };
  private turning = 0;
  private off: (() => void)[] = [];

  constructor(
    surface: HTMLElement,
    private readonly steer: CameraSteer,
  ) {
    this.listen(surface, 'wheel', (e) => this.wheel(e as WheelEvent), { passive: false });
    this.listen(surface, 'pointerdown', (e) => this.down(e as PointerEvent), { capture: true });
    this.listen(window, 'pointermove', (e) => this.move(e as PointerEvent));
    this.listen(window, 'pointerup', () => (this.drag = undefined));
    this.listen(window, 'keydown', (e) => this.key(e as KeyboardEvent, true));
    this.listen(window, 'keyup', (e) => this.key(e as KeyboardEvent, false));
    this.listen(surface, 'auxclick', (e) => e.preventDefault());
  }

  private listen(on: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void {
    on.addEventListener(type, fn, opts);
    this.off.push(() => on.removeEventListener(type, fn, opts));
  }

  /** Turns while a turn key is held; call every frame. */
  tick(dt: number): void {
    if (this.turning) this.steer.turn(this.turning * TURN_PER_SECOND * dt);
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const notches = Math.max(-3, Math.min(3, e.deltaY / 100));
    this.steer.zoom(notches);
  }

  /** A middle press turns the camera and goes no further; a right press may become a pan. */
  private down(e: PointerEvent): void {
    if (e.button !== 1 && e.button !== 2) return;
    const p: Point = [e.clientX, e.clientY];
    this.drag = { button: e.button, last: p, start: p, moved: false };
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  private move(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const p: Point = [e.clientX, e.clientY];
    const by: Point = [p[0] - d.last[0], p[1] - d.last[1]];
    d.last = p;
    d.moved ||= Math.hypot(p[0] - d.start[0], p[1] - d.start[1]) > DRAG_PIXELS;
    if (d.button === 1) this.steer.turn(by[0] * TURN_PER_PIXEL);
    else if (d.moved) this.steer.pan(by);
  }

  private key(e: KeyboardEvent, down: boolean): void {
    if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const keys = currentKeys();
    const turn = actionOf(e, keys, ['cam-left', 'cam-right']);
    if (turn) {
      const way = turn === 'cam-left' ? -1 : 1;
      this.turning = down ? way : 0;
      return;
    }
    if (!down || e.repeat) return;
    const action = actionOf(e, keys, ['cam-tactical', 'cam-centre']);
    if (action === 'cam-tactical') this.steer.tactical();
    else if (action === 'cam-centre') this.steer.centre();
  }

  dispose(): void {
    for (const off of this.off) off();
  }
}
