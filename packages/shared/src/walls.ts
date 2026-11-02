import { distToSegment, passesOneWay, segmentsIntersect } from './geometry.ts';
import type { Point, SenseRestriction, Wall, WallRules } from './schema.ts';

// What each wall stops. A wall restricts movement, sight, light and sound
// separately (Foundry's wall senses); missing means it stops them all, and an
// open door stops nothing. Limited walls let a sense through one of them but
// not two; proximity walls let it through only from close to the wall.

export type WallSenseKind = 'sight' | 'light' | 'sound';
export type WallKind = 'move' | WallSenseKind;

/** Which sense a line is drawn for, and the grid to turn proximity feet into pixels. */
export interface WallSense {
  kind: WallSenseKind;
  gridSize: number;
}

/** The area a sense (sight by default) reaches from a point within a radius, stopped by walls. */
export type ReachPolygon = (at: Point, radius: number, kind?: WallSenseKind) => number[];

/** How `wall` restricts `kind` (an open door restricts nothing). */
export function restriction(wall: WallRules, kind: WallKind): SenseRestriction {
  if (wall.door === 'open') return 'none';
  return wall[kind] ?? 'normal';
}

/** A wall as it stands for one sense seen from one place: it stops it, or only a second one does. */
export interface Blocker {
  wall: Wall;
  limited: boolean;
}

/** Whether `from` is close enough to a proximity wall to pass it. */
function nearEnough(wall: Wall, from: Point, sense: WallSense): boolean {
  const feet = wall.threshold?.[sense.kind] ?? 0;
  return distToSegment(from, wall.a, wall.b) <= (feet / 5) * sense.gridSize;
}

/** The walls that stop `sense` coming from `from`: none-walls and near proximity walls left out. */
export function blockers(walls: readonly Wall[], from: Point, sense: WallSense): Blocker[] {
  const out: Blocker[] = [];
  for (const wall of walls) {
    const r = restriction(wall, sense.kind);
    if (r === 'none' || passesOneWay(wall, from) || (r === 'proximity' && nearEnough(wall, from, sense))) continue;
    out.push({ wall, limited: r === 'limited' });
  }
  return out;
}

/** How many walls stop `sense` between two points: the first limited wall on the way doesn't count. */
export function wallsCrossed(from: Point, to: Point, walls: readonly Wall[], sense: WallSense): number {
  let normal = 0;
  let limited = 0;
  for (const b of blockers(walls, from, sense)) {
    if (!segmentsIntersect(from, to, b.wall.a, b.wall.b)) continue;
    if (b.limited) limited++;
    else normal++;
  }
  return normal + Math.max(0, limited - 1);
}

const RULE_KEYS = ['move', 'sight', 'light', 'sound'] as const;

/** The usual kinds of wall and what each stops (anything left out stops it). */
export const WALL_PRESETS = {
  wall: {},
  door: { door: 'closed' },
  /** Glass or bars: stops movement and sound, not sight or light. */
  window: { sight: 'none', light: 'none' },
  /** Tall grass, a thin curtain: you see through one but not two. */
  terrain: { sight: 'limited', light: 'limited', sound: 'limited' },
  /** An invisible barrier: stops movement only. */
  invisible: { sight: 'none', light: 'none', sound: 'none' },
  /** An illusory wall: stops sight, light and sound, but you walk through. */
  ethereal: { move: 'none' },
} as const satisfies Record<string, WallRules>;
export type WallPreset = keyof typeof WALL_PRESETS;

/** Which usual kind a wall is, or `custom`. Any door is a door. */
export function wallPreset(wall: WallRules): WallPreset | 'custom' {
  if (wall.door) return 'door';
  const same = (p: WallRules) => RULE_KEYS.every((k) => (wall[k] ?? 'normal') === (p[k] ?? 'normal'));
  const found = (Object.keys(WALL_PRESETS) as WallPreset[]).find((k) => k !== 'door' && same(WALL_PRESETS[k]));
  return found ?? 'custom';
}
