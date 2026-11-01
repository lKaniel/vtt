import type { Point } from './schema.ts';
import type { Region } from './scene-items.ts';
import { activeAt } from './levels.ts';
import { pointInPolygon } from './vision.ts';

// Regions: areas of a scene with behaviours (difficult ground, traps,
// teleporters). The server runs a region's behaviours when a token walks
// into it; difficult ground also makes paths through it cost more.

export function inRegion(region: Pick<Region, 'points'>, p: Point): boolean {
  return pointInPolygon(p, region.points.flat());
}

/** Whether a region works now: not turned off, and in its darkness band. */
export function regionWorks(region: Region, darkness: number): boolean {
  return !region.disabled && activeAt(region.activeAt, darkness);
}

/** The regions a walk along `path` went into, each with the index of the first point inside. */
export function regionsEntered(regions: readonly Region[], path: readonly Point[]): { region: Region; at: number }[] {
  const out: { region: Region; at: number }[] = [];
  for (const region of regions) {
    if (!path.length || inRegion(region, path[0]!)) continue;
    const at = path.findIndex((p) => inRegion(region, p));
    if (at > 0) out.push({ region, at });
  }
  return out;
}

/** How much a square costs to walk into, by the difficult ground over it: 1 normally, 2 in difficult terrain. */
export function regionCost(regions: readonly Region[], darkness: number): (p: Point) => number {
  const slow = regions
    .filter((r) => regionWorks(r, darkness))
    .flatMap((r) => r.behaviors.flatMap((b) => (b.type === 'difficult' ? [{ region: r, by: b.multiplier ?? 2 }] : [])));
  if (!slow.length) return () => 1;
  return (p) => slow.reduce((cost, s) => (inRegion(s.region, p) ? Math.max(cost, s.by) : cost), 1);
}
