import { levelAt, type Point, type Region, type RegionBehavior, type SceneLevel } from '@vtt/shared';
import { z } from 'zod';

// A Foundry scene's floors as our levels. Two kinds of data come in:
// - v14's own scene levels: `levels` on the scene (id, name, elevation band,
//   the levels seen from it), and a `levels` list of ids on each placeable.
//   The Levels migration makes overlapping bands (0-10, 10-20 and a 0-59
//   that holds the tiles every floor shares).
// - the Levels module's flags (v13 and before, or a v14 scene not migrated):
//   `sceneLevels` bands on the scene, and on each placeable its elevation
//   (or `rangeBottom`) and `rangeTop`; walls by Wall Height's bottom/top.
//   Stairs and elevators are drawings with a `drawingMode`.
// Our levels are floors by where each starts: one per distinct bottom, the
// tightest band naming it. A band stands for the floors that start inside
// it, so a 0-59 band is "the ground floor and the one above it".

/** Foundry grid units to feet. */
type Feet = (units: number) => number;

interface Band {
  bottom: number;
  top: number;
  name: string;
  id?: string;
  sees?: readonly string[];
}

export interface Floors {
  levels: SceneLevel[];
  /** Where a placeable is: one `level`, several `levels`, or every floor (nothing). */
  on(item: unknown): { level?: string; levels?: string[] };
  /** The behaviours of a Foundry region that move creatures between floors (changeLevel, Levels' scripts). */
  behaviors(region: unknown): RegionBehavior[];
  /** A Levels stair or elevator drawing as a region; undefined for any other drawing. */
  drawingRegion(drawing: unknown): Omit<Region, 'id'> | undefined;
  /** A token's elevation in feet, raised onto the floor v14 says it is on. */
  elevationOf(token: unknown): number;
}

const num = z.number().nullable().optional().catch(undefined);
const numeric = z.union([z.number(), z.string()]).nullable().optional().catch(undefined);
const ids = z.array(z.string()).optional().catch(undefined);

const V14Level = z.object({
  _id: z.string(),
  name: z.string().catch(''),
  elevation: z.object({ bottom: num, top: num }).catch({}),
  visibility: z.object({ levels: ids }).optional().catch(undefined),
});

const LevelsFlags = z
  .object({
    rangeBottom: numeric,
    rangeTop: numeric,
    drawingMode: numeric,
    elevatorFloors: z.string().optional().catch(undefined),
  })
  .optional()
  .catch(undefined);

const Placed = z.object({
  levels: ids,
  elevation: z
    .union([z.number(), z.object({ bottom: num, top: num })])
    .nullable()
    .optional()
    .catch(undefined),
  level: z.string().optional().catch(undefined),
  flags: z
    .object({
      levels: LevelsFlags,
      'wall-height': z.object({ bottom: numeric, top: numeric }).optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
});
type PlacedData = z.infer<typeof Placed>;

const SceneData = z.object({
  levels: z.array(z.unknown()).optional().catch(undefined),
  flags: z
    .object({
      levels: z
        .object({ sceneLevels: z.array(z.array(numeric)).optional().catch(undefined) })
        .optional()
        .catch(undefined),
    })
    .optional()
    .catch(undefined),
});

type Numeric = number | string | null | undefined;

const toNumber = (v: Numeric): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** v14's floors, when the scene has more than its default one. */
function v14Bands(levels: unknown[] | undefined, feet: Feet): Band[] {
  const parsed = (levels ?? []).flatMap((l) => V14Level.safeParse(l).data ?? []);
  if (parsed.length < 2) return [];
  return parsed.map((l) => ({
    id: l._id,
    name: l.name,
    bottom: feet(l.elevation.bottom ?? 0),
    top: l.elevation.top === null || l.elevation.top === undefined ? Infinity : feet(l.elevation.top),
    sees: l.visibility?.levels ?? [],
  }));
}

/** The Levels module's `sceneLevels`: [bottom, top, name] each, numbers as text. */
function moduleBands(rows: Numeric[][] | undefined, feet: Feet): Band[] {
  return (rows ?? []).flatMap((row) => {
    const bottom = toNumber(row[0]);
    if (bottom === undefined) return [];
    const top = toNumber(row[1]);
    return [{ bottom: feet(bottom), top: top === undefined ? Infinity : feet(top), name: String(row[2] ?? '') }];
  });
}

/** One floor per distinct bottom, named by the tightest band starting there. */
function floorsOf(bands: readonly Band[]): { floor: Band; level: SceneLevel }[] {
  const tightest = new Map<number, Band>();
  for (const b of bands) {
    const had = tightest.get(b.bottom);
    if (!had || b.top < had.top) tightest.set(b.bottom, b);
  }
  return [...tightest.values()]
    .sort((a, b) => a.bottom - b.bottom)
    .map((floor, i) => ({
      floor,
      level: {
        id: `level-${i + 1}`,
        name: floor.name.trim() || `Level at ${floor.bottom} ft`,
        bottom: floor.bottom,
        ...(Number.isFinite(floor.top) && floor.top > floor.bottom ? { top: floor.top } : {}),
      },
    }));
}

/** Our floors starting inside a band (top inclusive, as Levels has it). */
const within = (levels: readonly SceneLevel[], bottom: number, top: number) =>
  levels.filter((l) => l.bottom >= bottom && l.bottom <= top).map((l) => l.id);

/** `ids` as a placement: none or every floor is every floor. */
function placement(levels: readonly SceneLevel[], on: readonly string[]): { level?: string; levels?: string[] } {
  const unique = levels.map((l) => l.id).filter((id) => on.includes(id));
  if (!unique.length || unique.length === levels.length) return {};
  return unique.length === 1 ? { level: unique[0]! } : { levels: unique };
}

/** An elevation field: a number (tiles, lights, tokens) or a band (v12+ regions). */
function elevationBand(p: PlacedData): { bottom?: number; top?: number } {
  if (typeof p.elevation === 'number') return { bottom: p.elevation };
  return { bottom: p.elevation?.bottom ?? undefined, top: p.elevation?.top ?? undefined };
}

/** The first of these that is a number. */
const firstOf = (...vs: Numeric[]) => vs.map(toNumber).find((n) => n !== undefined);

/** An item's band in feet, from the Levels flags, Wall Height or its elevation. */
function bandOf(p: PlacedData, feet: Feet): [number, number] | undefined {
  const lv = p.flags?.levels;
  const wh = p.flags?.['wall-height'];
  const own = elevationBand(p);
  const bottom = firstOf(lv?.rangeBottom, wh?.bottom, own.bottom);
  const top = firstOf(lv?.rangeTop, wh?.top, own.top);
  if (bottom === undefined && top === undefined) return undefined;
  return [bottom === undefined ? -Infinity : feet(bottom), top === undefined ? Infinity : feet(top)];
}

const outlineOf = (d: {
  x: number;
  y: number;
  shape: { type: string; width?: number; height?: number; points?: number[] };
}): Point[] => {
  const { x, y } = d;
  const [w, h] = [d.shape.width ?? 0, d.shape.height ?? 0];
  if (d.shape.type === 'p' || d.shape.type === 'f') {
    const xs = d.shape.points ?? [];
    return Array.from({ length: Math.floor(xs.length / 2) }, (_, i): Point => [x + xs[2 * i]!, y + xs[2 * i + 1]!]);
  }
  if (d.shape.type === 'e')
    return Array.from({ length: 16 }, (_, i): Point => {
      const a = (i / 16) * 2 * Math.PI;
      return [Math.round(x + w / 2 + (Math.cos(a) * w) / 2), Math.round(y + h / 2 + (Math.sin(a) * h) / 2)];
    });
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
};

const Drawing = Placed.extend({
  x: z.number(),
  y: z.number(),
  shape: z.object({
    type: z.string(),
    width: z.number().optional().catch(undefined),
    height: z.number().optional().catch(undefined),
    points: z.array(z.number()).optional().catch(undefined),
  }),
});

const RegionData = Placed.extend({
  behaviors: z.array(z.object({ type: z.string(), system: z.record(z.string(), z.unknown()).catch({}) })).catch([]),
});

const STAIR_SCRIPT = 'RegionHandler.stair(';

/** Levels' stairs: both ways (2), up only (21), down only (22). */
function stairsKind(mode: number, lower: string, upper: string): Omit<Region, 'id' | 'points'> {
  if (mode === 21) return { name: 'Stairs up', level: lower, behaviors: [{ type: 'level', to: upper }] };
  if (mode === 22) return { name: 'Stairs down', level: upper, behaviors: [{ type: 'level', to: lower }] };
  return { name: 'Stairs', levels: [lower, upper], behaviors: [{ type: 'stairs', between: [lower, upper] }] };
}
const ELEVATOR_SCRIPT = /RegionHandler\.elevator\([^"'`]*["'`]([^"'`]*)["'`]/;

class FloorPlan implements Floors {
  readonly levels: SceneLevel[];
  /** v14 level id → the floors its band covers. */
  private byId = new Map<string, string[]>();

  constructor(
    bands: readonly Band[],
    private feet: Feet,
    private v14: boolean,
  ) {
    const floors = floorsOf(bands);
    this.levels = floors.map((f) => f.level);
    for (const b of bands) if (b.id) this.byId.set(b.id, within(this.levels, b.bottom, b.top));
    for (const { floor, level } of floors) {
      const sees = this.seenFrom(floor, level);
      if (sees.length) level.sees = sees;
    }
  }

  /** The floors below seen from a floor: those v14 lists, or (Levels) every one below. */
  private seenFrom(floor: Band, level: SceneLevel): string[] {
    const seen = new Set((floor.sees ?? []).flatMap((id) => this.byId.get(id) ?? []));
    const below = this.levels.filter((l) => l.bottom < level.bottom);
    return (this.v14 ? below.filter((l) => seen.has(l.id)) : below).map((l) => l.id);
  }

  /** The floor an elevation (feet) is on. */
  private floorAt(feet: number): string | undefined {
    return levelAt(this.levels, feet)?.id;
  }

  on(item: unknown): { level?: string; levels?: string[] } {
    const p = Placed.safeParse(item).data ?? {};
    if (this.v14)
      return placement(
        this.levels,
        (p.levels ?? []).flatMap((id) => this.byId.get(id) ?? []),
      );
    const band = bandOf(p, this.feet);
    return band ? placement(this.levels, within(this.levels, band[0], band[1])) : {};
  }

  /** Stairs between two floors, an elevator among more. */
  private between(floors: readonly string[]): RegionBehavior[] {
    const unique = this.levels.map((l) => l.id).filter((id) => floors.includes(id));
    if (unique.length < 2) return [];
    if (unique.length === 2) return [{ type: 'stairs', between: [unique[0]!, unique[1]!] }];
    return [{ type: 'elevator', floors: unique }];
  }

  /** Levels' "0,Ground|10,Hall": the floors at those elevations. */
  private elevatorFloors(list: string): RegionBehavior[] {
    const at = list.split('|').flatMap((part) => {
      const n = toNumber(part.split(',')[0]);
      return n === undefined ? [] : [this.floorAt(this.feet(n)) ?? ''];
    });
    const floors = this.levels.map((l) => l.id).filter((id) => at.includes(id));
    return floors.length ? [{ type: 'elevator', floors }] : [];
  }

  /** The floor at a band's bottom and the one just over its top. */
  private stairsOf(band: [number, number] | undefined): string[] {
    if (!band || !Number.isFinite(band[0]) || !Number.isFinite(band[1])) return [];
    return [this.floorAt(band[0]), this.floorAt(band[1] + 1)].flatMap((id) => id ?? []);
  }

  behaviors(region: unknown): RegionBehavior[] {
    const r = RegionData.safeParse(region).data;
    if (!r) return [];
    return r.behaviors.flatMap((b) => {
      if (b.type === 'changeLevel') return this.between((r.levels ?? []).flatMap((id) => this.byId.get(id) ?? []));
      const source = typeof b.system.source === 'string' ? b.system.source : '';
      const lift = ELEVATOR_SCRIPT.exec(source);
      if (lift) return this.elevatorFloors(lift[1]!);
      if (source.includes(STAIR_SCRIPT)) return this.between(this.stairsOf(bandOf(r, this.feet)));
      return [];
    });
  }

  drawingRegion(drawing: unknown): Omit<Region, 'id'> | undefined {
    const d = Drawing.safeParse(drawing).data;
    const flags = d?.flags?.levels;
    const mode = toNumber(flags?.drawingMode) ?? 0;
    const points = d && mode > 1 ? outlineOf(d) : [];
    if (!d || points.length < 3) return undefined;
    if (mode === 3) return this.liftRegion(points, flags?.elevatorFloors);
    return this.stairsRegion(points, mode, bandOf(d, this.feet));
  }

  /** A Levels stairs drawing: from the floor at its bottom to the one over its top. */
  private stairsRegion(
    points: Point[],
    mode: number,
    band: [number, number] | undefined,
  ): Omit<Region, 'id'> | undefined {
    const [lower, upper] = this.stairsOf(band);
    if (!lower || !upper || lower === upper) return undefined;
    return { points, ...stairsKind(mode, lower, upper) };
  }

  /** A Levels elevator drawing: the floors its list names. */
  private liftRegion(points: Point[], list: string | undefined): Omit<Region, 'id'> | undefined {
    const lift = this.elevatorFloors(list ?? '');
    return lift.length ? { name: 'Elevator', points, behaviors: lift } : undefined;
  }

  elevationOf(token: unknown): number {
    const t = Placed.safeParse(token).data ?? {};
    const elevation = typeof t.elevation === 'number' ? this.feet(t.elevation) : 0;
    const floor = t.level ? this.byId.get(t.level)?.[0] : undefined;
    const level = this.levels.find((l) => l.id === floor);
    if (!level || this.floorAt(elevation) === level.id) return elevation;
    return level.bottom;
  }
}

/** The floors of a Foundry scene, or undefined when it has one. */
export function foundryFloors(scene: unknown, feet: Feet): Floors | undefined {
  const s = SceneData.safeParse(scene).data ?? {};
  const v14 = v14Bands(s.levels, feet);
  const bands = v14.length ? v14 : moduleBands(s.flags?.levels?.sceneLevels, feet);
  const plan = new FloorPlan(bands, feet, v14.length > 0);
  return plan.levels.length > 1 ? plan : undefined;
}
