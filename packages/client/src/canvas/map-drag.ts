import type { Point } from '@vtt/shared';
import type { CameraMotion } from './camera-motion.ts';

// A press on the 2D map and the drag it may become (MapView): right and
// middle drags pan, a finger on open ground pans, a token drag waits for the
// drop, and a fling glides on when let go.

/** Screen pixels a press may wander before it is a drag. */
const DRAG_THRESHOLD = 5;

export interface Drag {
  start: Point;
  last: Point;
  /** When the pointer was last at `last`, for the speed of a fling. */
  at: number;
  panning: boolean;
  button: number;
  /** Set when the drag started on a token you control: dropping it walks the token there. */
  token?: string;
  moved?: boolean;
  /** A finger on open ground: it drags the map, and is a click where it lifts if it didn't move. */
  tap?: boolean;
}

/** A press at `p` (screen pixels). */
export function pressAt(p: Point, button: number, more: Partial<Drag> = {}): Drag {
  return { start: p, last: p, at: performance.now(), panning: button === 1, button, ...more };
}

/** The pointer moved to `p` while pressed: true when the camera panned. */
export function dragTo(drag: Drag, p: Point, cam: CameraMotion): boolean {
  const far = Math.hypot(p[0] - drag.start[0], p[1] - drag.start[1]) > DRAG_THRESHOLD;
  if (far) drag.moved = true;
  if (drag.token) return false;
  if (far && (drag.button !== 0 || drag.tap)) drag.panning = true;
  const now = performance.now();
  if (drag.panning) cam.drag([p[0] - drag.last[0], p[1] - drag.last[1]], (now - drag.at) / 1000);
  drag.last = p;
  drag.at = now;
  return drag.panning;
}

/** A fling glides on; a drag that stopped before letting go stays put. */
export function letGo(drag: Drag, cam: CameraMotion): void {
  if (performance.now() - drag.at < 80) cam.release();
}
