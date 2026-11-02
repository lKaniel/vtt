import { type Point, restriction, type Wall, wallPreset } from '@vtt/shared';
import type { Graphics } from 'pixi.js';

// How walls, windows and doors look: stone walls with a soft shadow on the
// floor, glazed windows, and plank doors that swing open on their hinge.

const LEAF = 10;
/** How far an open door swings, in radians. */
const SWING = (80 * Math.PI) / 180;
const WOOD = 0x6b4426;
const WOOD_EDGE = 0x24160b;
const IRON = 0x8f8572;

/** The door leaf as a flat polygon: across the doorway, or swung open from the hinge at `a`. */
export function doorLeaf(a: Point, b: Point, open: boolean): number[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]) + (open ? SWING : 0);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy * (LEAF / 2);
  const ny = dx * (LEAF / 2);
  const end: Point = [a[0] + dx * len, a[1] + dy * len];
  return [a[0] + nx, a[1] + ny, end[0] + nx, end[1] + ny, end[0] - nx, end[1] - ny, a[0] - nx, a[1] - ny];
}

/**
 * Walls that look like stone: they stop sight (an illusory wall too). Walls
 * you see through one of (tall grass) and invisible barriers aren't drawn:
 * the map's own picture shows them.
 */
function stone(w: Wall): boolean {
  if (w.door) return false;
  const sight = restriction(w, 'sight');
  return sight === 'normal' || sight === 'proximity';
}

/** A soft dark band where walls meet the floor, like ambient occlusion. */
export function drawWallShadows(g: Graphics, walls: readonly Wall[]): void {
  const solid = walls.filter(stone);
  for (const [width, alpha] of [
    [46, 0.06],
    [32, 0.08],
    [20, 0.12],
  ] as const) {
    for (const w of solid) g.moveTo(...w.a).lineTo(...w.b);
    g.stroke({ width, color: 0x000000, alpha, cap: 'round' });
  }
}

/** Stone walls, and windows as glass in a dark frame. */
export function drawWalls(g: Graphics, walls: readonly Wall[]): void {
  const solid = walls.filter(stone);
  const windows = walls.filter((w) => wallPreset(w) === 'window');
  const stroke = (list: Wall[], width: number, color: number, alpha = 1) => {
    if (list.length === 0) return;
    for (const w of list) g.moveTo(...w.a).lineTo(...w.b);
    g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
  };
  stroke([...solid, ...windows], 16, 0x15120f);
  stroke(solid, 10, 0x575047);
  stroke(solid, 3, 0x8c8273, 0.55);
  stroke(windows, 5, 0xa9d2e6, 0.75);
}

/** A plank door, open or shut; a locked one has an iron band. */
export function drawDoor(g: Graphics, wall: Wall): void {
  const open = wall.door === 'open';
  const leaf = doorLeaf(wall.a, wall.b, open);
  // The frame stays in the wall: posts at both ends.
  for (const p of [wall.a, wall.b]) g.circle(p[0], p[1], 9).fill(0x15120f);
  g.poly(leaf)
    .fill({ color: WOOD, alpha: open ? 0.85 : 1 })
    .stroke({ width: 2, color: WOOD_EDGE });
  if (wall.door === 'locked') {
    const mid = [(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2] as const;
    g.circle(mid[0], mid[1], 6).fill(IRON).stroke({ width: 2, color: 0x2a251d });
  }
}
