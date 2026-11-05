import type { Point } from '@vtt/shared';

// How the 3D view's attack and spell effects move, as plain maths
// (effects3d.ts draws them). Points are map pixels with a height: [x, y, h].

export type V3 = [number, number, number];

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
export const easeOut = (t: number) => 1 - (1 - t) ** 3;

export const lerp3 = (a: V3, b: V3, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** How a missile flies: an arrow lobs, a spell orb barely rises, a bolt strikes straight. */
export type Flight = 'arrow' | 'orb' | 'bolt';
const ARC: Record<Flight, number> = { arrow: 0.12, orb: 0.04, bolt: 0 };
/** The highest any arc goes, pixels (about 6 squares). */
const MAX_ARC = 600;

/** How high a missile's path rises over its middle, pixels. */
export function arcOf(from: V3, to: V3, flight: Flight): number {
  return Math.min(MAX_ARC, Math.hypot(to[0] - from[0], to[1] - from[1]) * ARC[flight]);
}

/** Where a missile is `t` of the way along, rising `arc` over its middle. */
export function flightAt(from: V3, to: V3, t: number, arc: number): V3 {
  const p = lerp3(from, to, t);
  p[2] += 4 * arc * t * (1 - t);
  return p;
}

/** How far a lunge has stepped along `dir` (a unit vector) `t` of its way: out and back. */
export function lungeAt(dir: Point, t: number, reach: number): Point {
  const d = Math.sin(Math.PI * clamp01(t)) * reach;
  return [dir[0] * d, dir[1] * d];
}

/** A struck creature's sideways shake `t` of its way, dying out. */
export function shakeAt(t: number, amp: number): number {
  if (t >= 1) return 0;
  return Math.sin(t * 40) * amp * (1 - t);
}

/** A floating number `t` of its way: how far it has risen (0 to 1), its size and how much shows. */
export function numberAt(t: number): { rise: number; scale: number; alpha: number } {
  const scale = t < 0.08 ? 0.8 + (t / 0.08) * 0.5 : 1.3 - clamp01((t - 0.08) / 0.15) * 0.3;
  return { rise: easeOut(clamp01(t)), scale, alpha: 1 - clamp01((t - 0.65) / 0.35) };
}

/** A crackling bolt's points: `steps` pieces, each joint knocked aside by up to an eighth of the length. */
export function boltPath(from: V3, to: V3, steps: number, random: () => number = Math.random): V3[] {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  const side: Point = [-(to[1] - from[1]) / len, (to[0] - from[0]) / len];
  const out: V3[] = [from];
  for (let i = 1; i < steps; i++) {
    const p = lerp3(from, to, i / steps);
    const off = (random() - 0.5) * Math.min(60, len * 0.12);
    out.push([p[0] + side[0] * off, p[1] + side[1] * off, p[2] + (random() - 0.5) * off * 0.6]);
  }
  out.push(to);
  return out;
}
