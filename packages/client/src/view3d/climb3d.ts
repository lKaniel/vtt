import type { Point } from '@vtt/shared';
import { drape, type HeightAt } from './marks3d.ts';

// Walking up what stands in a 3D scene, as 3D Canvas lifts tokens onto it:
// a walk climbs the path it takes step by step, a ledge at a time (never a
// wall), so it ends on a bridge or a tower's top it went up to, and on the
// ground again when it walks off. The server takes where it ends as the
// creature's elevation (session-requests.ts).

/** Three's y where a walk along `points` ends, every `step` pixels climbing what lies under it from `start`. */
export function climbEnd(points: readonly Point[], step: number, start: number, ground: HeightAt): number {
  const heightAt: HeightAt = (x, y, from) => ground(x, y, from ?? start);
  return drape(points, step, heightAt).at(-1)?.[1] ?? start;
}

/** The elevation (feet) a walk ending at three's y `end` gives a creature; none for a flyer, or when it stays as high. */
export function climbFeet(
  end: number,
  px: number,
  walker: { elevation?: number; flying: boolean },
): number | undefined {
  if (walker.flying) return undefined;
  const feet = Math.round(end / px);
  return Math.abs(feet - (walker.elevation ?? 0)) >= 1 ? feet : undefined;
}

/** What a climb needs of the 3D view. */
export interface ClimbHost {
  /** Where a creature is on the map, and how high (feet). */
  token(id: string): { x: number; y: number; elevation?: number } | undefined;
  /** Where the 2D map draws a creature now (between the squares while it walks). */
  placeOf(id: string): Point | undefined;
  /** Three's y of the surface at a map point a walker with feet at `from` steps onto, up to `step` higher. */
  ground(at: Point, from: number, step: number): number;
  /** The way the preview showed a creature's walk going, if it did. */
  route(id: string): readonly Point[] | undefined;
  /** Pixels per foot, and per square. */
  px(): number;
  grid(): number;
}

/** The most a step climbs, feet: stairs, a crate, a scaffold's platform (pulling up onto it), never a wall. */
export const CLIMB_FEET = 5;

/**
 * Creatures climbing in 3D: how high a walk ends (`end`, sent with the
 * move), and, while one walks, where its feet are now, climbing from where
 * it stood a step at a time (`walking`), so it goes up the stairs it walks.
 */
export class Climbing {
  /** Where each creature stood at rest, and whether it flew. */
  private rest = new Map<string, { feet: number; flying: boolean }>();
  /** Where each walking creature's feet are now. */
  private strides = new Map<string, number>();

  constructor(private readonly host: ClimbHost) {}

  stood(id: string, feet: number, flying: boolean): void {
    this.rest.set(id, { feet, flying });
    this.strides.delete(id);
  }

  /** How high (feet) a walk of `id` to `to` ends; none when that does not change. */
  end(id: string, to: readonly [number, number]): number | undefined {
    const t = this.host.token(id);
    const rest = this.rest.get(id);
    if (!t || !rest) return undefined;
    const from: Point = this.host.placeOf(id) ?? [t.x, t.y];
    const route = this.host.route(id);
    const goal: Point = [to[0], to[1]];
    const points = route && near(route.at(-1)!, goal, this.host.grid()) ? route : [from, goal];
    const step = this.host.grid() / 4;
    const end = climbEnd(points, step, rest.feet, (x, y, h) => this.climb([x, y], h ?? rest.feet));
    return climbFeet(end, this.host.px(), { elevation: t.elevation, flying: rest.flying });
  }

  /** Where `id`'s feet are while it walks (at `at`, not yet where it is going); none at rest or flying. */
  walking(id: string, at: Point): number | undefined {
    const t = this.host.token(id);
    const rest = this.rest.get(id);
    if (!t || !rest || rest.flying || (at[0] === t.x && at[1] === t.y)) {
      this.strides.delete(id);
      return undefined;
    }
    const feet = this.climb(at, this.strides.get(id) ?? rest.feet);
    this.strides.set(id, feet);
    return feet;
  }

  private climb(at: Point, from: number): number {
    return this.host.ground(at, from, CLIMB_FEET * this.host.px());
  }
}

const near = (a: Point, b: Point, within: number) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= within;
