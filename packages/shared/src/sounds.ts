import type { Point, Wall } from './schema.ts';
import type { Sound } from './scene-items.ts';
import { activeAt } from './levels.ts';
import { feetToPx } from './vision.ts';
import { wallsCrossed } from './walls.ts';

// Ambient sounds: how loud one is where the listener stands. It fades from
// its volume at its centre to nothing at its radius, and a wall in between
// muffles it, unless it carries through walls.

/** How much quieter a sound is with a wall between (each wall, down to a floor). */
const MUFFLE = 0.4;

export interface Hearing {
  gridSize: number;
  wallsBetween: (a: Point, b: Point) => readonly Wall[];
  /** The scene's darkness, for sounds that only play at night. */
  darkness?: number;
}

/** 0 to 1: how loud `sound` is at `at`. */
export function soundVolume(sound: Sound, at: Point, ctx: Hearing): number {
  if (sound.hidden || !activeAt(sound.activeAt, ctx.darkness ?? 0)) return 0;
  const reach = feetToPx(sound.radius, ctx.gridSize);
  const d = Math.hypot(at[0] - sound.x, at[1] - sound.y);
  if (d >= reach) return 0;
  const base = (sound.volume ?? 0.5) * (1 - d / reach);
  if (sound.walls === false) return base;
  const from: Point = [sound.x, sound.y];
  const walls = wallsCrossed(from, at, ctx.wallsBetween(from, at), { kind: 'sound', gridSize: ctx.gridSize });
  return base * MUFFLE ** Math.min(walls, 2);
}
