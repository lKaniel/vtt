import type { Point, Rect } from '@vtt/shared';

// A ping off the edge of your screen shows as an arrow on that edge,
// pointing the way to it (PresenceLayer.ts), so you know where to look.

/**
 * Where on the edge of `view` (kept `margin` in from it) the line from its
 * middle to `at` leaves, and the angle (radians) it points along; undefined
 * when `at` is on screen.
 */
export function edgeArrow(view: Rect, at: Point, margin: number): { at: Point; angle: number } | undefined {
  const inside = at[0] >= view.x && at[0] <= view.x + view.w && at[1] >= view.y && at[1] <= view.y + view.h;
  if (inside) return undefined;
  const mid: Point = [view.x + view.w / 2, view.y + view.h / 2];
  const [dx, dy] = [at[0] - mid[0], at[1] - mid[1]];
  const half: Point = [Math.max(0, view.w / 2 - margin), Math.max(0, view.h / 2 - margin)];
  // How far along the line the inset edge is met, the nearer of the sides it heads for.
  const k = Math.min(dx ? half[0] / Math.abs(dx) : Infinity, dy ? half[1] / Math.abs(dy) : Infinity);
  return { at: [mid[0] + dx * k, mid[1] + dy * k], angle: Math.atan2(dy, dx) };
}
