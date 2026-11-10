import type { Point } from '@vtt/shared';
import { actionOf, currentKeys } from '../keys/keybinds.ts';
import { Fingers, type Pinch } from '../canvas/touch-gestures.ts';
import { ORBIT } from './orbit.ts';

// The 3D camera's own controls, as in BG3: the wheel zooms (and tilts), a
// middle drag turns the camera round (sideways) and tilts it (up and down),
// a right drag or W A S D moves it, and keys turn it, look straight down, or
// go back to your creature. Left clicks (and a right click that doesn't
// move) go on to the map below (pixi-bridge.ts). On a touch screen two fingers
// pinch to zoom, move together to pan and twist to turn; one finger taps and
// holds as on the 2D map (canvas/map-touch.ts).

/** What the controls do to the camera. */
export interface CameraSteer {
  zoom(notches: number): void;
  turn(radians: number): void;
  /** Radians tilted down (negative: up). */
  tilt(radians: number): void;
  /** Screen pixels the view was dragged by. */
  pan(by: Point): void;
  /** Moves the camera for `dt` seconds the way the keys held point: [right, down the screen], each -1, 0 or 1. */
  glide(way: Point, dt: number): void;
  tactical(): void;
  centre(): void;
  /** The 3D view on or off. */
  toggle(): void;
}

/** Radians per pixel of a middle drag, and per second while a turn key is held. */
const TURN_PER_PIXEL = 0.006;
const TURN_PER_SECOND = 1.8;
const TILT_PER_PIXEL = 0.004;
/** The keys that move the camera, and the way each points: [right, down the screen]. */
const GLIDES: Record<string, Point> = {
  'cam-forward': [0, -1],
  'cam-back': [0, 1],
  'cam-pan-left': [-1, 0],
  'cam-pan-right': [1, 0],
};
const GLIDE_IDS = Object.keys(GLIDES);
/** A right press that moves less than this is a click (the map's menu). */
const DRAG_PIXELS = 5;

/** Two fingers moved: the camera comes in as far as they spread, pans with them and turns as they twist. */
export function steerPinch(steer: CameraSteer, pinch: Pinch): void {
  if (pinch.scale !== 1) steer.zoom(-Math.log(pinch.scale) / Math.log(ORBIT.zoomStep));
  if (pinch.pan[0] || pinch.pan[1]) steer.pan(pinch.pan);
  if (pinch.turn) steer.turn(-pinch.turn);
}

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export class CameraInput {
  private drag?: { button: number; last: Point; start: Point; moved: boolean };
  private turning = 0;
  /** The glide keys held. */
  private gliding = new Set<string>();
  private fingers = new Fingers();
  private off: (() => void)[] = [];

  constructor(
    surface: HTMLElement,
    private readonly steer: CameraSteer,
  ) {
    this.listen(surface, 'wheel', (e) => this.wheel(e as WheelEvent), { passive: false });
    this.listen(surface, 'pointerdown', (e) => this.down(e as PointerEvent), { capture: true });
    this.listen(window, 'pointermove', (e) => this.move(e as PointerEvent));
    this.listen(window, 'pointerup', (e) => this.up(e as PointerEvent));
    this.listen(window, 'pointercancel', (e) => this.up(e as PointerEvent));
    this.listen(window, 'keydown', (e) => this.key(e as KeyboardEvent, true));
    this.listen(window, 'keyup', (e) => this.key(e as KeyboardEvent, false));
    this.listen(window, 'blur', () => this.gliding.clear());
    this.listen(surface, 'auxclick', (e) => e.preventDefault());
  }

  private listen(on: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void {
    on.addEventListener(type, fn, opts);
    this.off.push(() => on.removeEventListener(type, fn, opts));
  }

  /** Turns while a turn key is held; call every frame. */
  tick(dt: number): void {
    if (this.turning) this.steer.turn(this.turning * TURN_PER_SECOND * dt);
    if (!this.gliding.size) return;
    const way: Point = [0, 0];
    for (const id of this.gliding) {
      way[0] += GLIDES[id]![0];
      way[1] += GLIDES[id]![1];
    }
    if (way[0] || way[1]) this.steer.glide(way, dt);
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const notches = Math.max(-3, Math.min(3, e.deltaY / 100));
    this.steer.zoom(notches);
  }

  /** A middle press turns the camera and goes no further; a right press may become a pan. */
  private down(e: PointerEvent): void {
    if (e.pointerType === 'touch') this.fingers.down(e.pointerId, [e.clientX, e.clientY]);
    if (e.button !== 1 && e.button !== 2) return;
    const p: Point = [e.clientX, e.clientY];
    this.drag = { button: e.button, last: p, start: p, moved: false };
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  private up(e: PointerEvent): void {
    this.drag = undefined;
    if (e.pointerType === 'touch') this.fingers.up(e.pointerId);
  }

  private move(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      const pinch = this.fingers.move(e.pointerId, [e.clientX, e.clientY]);
      if (pinch) steerPinch(this.steer, pinch);
    }
    const d = this.drag;
    if (!d) return;
    const p: Point = [e.clientX, e.clientY];
    const by: Point = [p[0] - d.last[0], p[1] - d.last[1]];
    d.last = p;
    d.moved ||= Math.hypot(p[0] - d.start[0], p[1] - d.start[1]) > DRAG_PIXELS;
    if (d.button === 1) {
      this.steer.turn(by[0] * TURN_PER_PIXEL);
      this.steer.tilt(by[1] * TILT_PER_PIXEL);
    } else if (d.moved) this.steer.pan(by);
  }

  private key(e: KeyboardEvent, down: boolean): void {
    if (!down) this.letGo(e);
    if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.glideKey(e, down) || this.turnKey(e, down) || !down || e.repeat) return;
    const action = actionOf(e, currentKeys(), ['cam-tactical', 'cam-centre']);
    if (action === 'cam-tactical') this.steer.tactical();
    else if (action === 'cam-centre') this.steer.centre();
  }

  /** W A S D pressed: held until let go. Shift+W is the GM's walk through walls, not a glide. */
  private glideKey(e: KeyboardEvent, down: boolean): boolean {
    const glide = e.shiftKey ? undefined : actionOf(e, currentKeys(), GLIDE_IDS);
    if (glide && down) this.gliding.add(glide);
    return !!glide;
  }

  /** A turn key turns while held. */
  private turnKey(e: KeyboardEvent, down: boolean): boolean {
    const turn = actionOf(e, currentKeys(), ['cam-left', 'cam-right']);
    if (!turn) return false;
    const way = turn === 'cam-left' ? -1 : 1;
    this.turning = down ? way : 0;
    return true;
  }

  /** A glide key let go, with or without Shift. */
  private letGo(e: KeyboardEvent): void {
    const id = actionOf({ key: e.key, shiftKey: false }, currentKeys(), GLIDE_IDS);
    if (id) this.gliding.delete(id);
  }

  dispose(): void {
    for (const off of this.off) off();
  }
}
