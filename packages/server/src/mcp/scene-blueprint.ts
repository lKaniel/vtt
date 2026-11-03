import { freeId, type Op, slugify } from '@vtt/core';
import type { Point } from '@vtt/shared';
import { z } from 'zod';
import { roomWalls, type Opening, type Side } from './room-walls.ts';

// A scene the way Claude describes one: rooms with doors, a path of wall,
// a torch here and three goblins there, in squares or pixels. It becomes the
// documents the game stores (walls, tiles, lights, regions, sounds, notes)
// and the creatures the GM places (see `build` in gm-actions.ts), so the
// server checks and keeps them like any edit.

const num = z.number();
const LIGHT_PRESETS = {
  torch: { bright: 20, dim: 20, color: '#ff9a40', animation: 'flicker', name: 'Torch' },
  candle: { bright: 5, dim: 5, color: '#ffc070', animation: 'flicker', name: 'Candle' },
  campfire: { bright: 20, dim: 40, color: '#ff8a30', animation: 'flicker', name: 'Campfire' },
  lamp: { bright: 15, dim: 30, color: '#ffd890', name: 'Lamp' },
  lantern: { bright: 30, dim: 30, color: '#ffc870', animation: 'flicker', name: 'Lantern' },
  magic: { bright: 10, dim: 20, color: '#7ab0ff', animation: 'pulse', name: 'Magic light' },
  darkness: { bright: 15, dim: 0, darkness: true, name: 'Darkness' },
} as const;
type LightPreset = keyof typeof LIGHT_PRESETS;
const LightPresetSchema = z.enum(Object.keys(LIGHT_PRESETS) as [LightPreset, ...LightPreset[]]);

/** The colour each painted ground is tinted when none is given. */
const GROUND_COLORS: Record<string, string> = {
  grass: '#7a9a55',
  dirt: '#8a6a48',
  sand: '#d8c08a',
  stone: '#9a9a98',
  cobble: '#8c8a86',
  wood: '#9a7048',
  water: '#4a7aa8',
  rock: '#7a746c',
};

/** What a wall is: each kind is a set of the wall fields (see "Tiles and walls" in game-format.md). */
const WALL_KINDS = {
  wall: {},
  window: { sight: 'none', light: 'none' },
  terrain: { sight: 'limited', light: 'limited', sound: 'limited' },
  invisible: { sight: 'none', light: 'none', sound: 'none' },
  ethereal: { move: 'none' },
  door: { door: 'closed' },
  open: { door: 'open' },
  locked: { door: 'locked' },
  secret: { door: 'closed', secret: true },
} as const;
type WallKind = keyof typeof WALL_KINDS;
const WallKindSchema = z.enum(Object.keys(WALL_KINDS) as [WallKind, ...WallKind[]]);
const OpeningKindSchema = z.enum([...WallKindSchema.options, 'arch']);

const named = {
  id: z.string().optional(),
  name: z.string().optional(),
  level: z.string().optional().describe('The scene level (floor) it is on; leave out for every floor'),
  levels: z.array(z.string()).optional().describe('Several floors (a staircase, a tower)'),
};
const box = { x: num, y: num, w: num.positive(), h: num.positive() };
const at = { x: num, y: num };

const RoomSchema = z.object({
  ...named,
  ...box,
  floor: z
    .string()
    .optional()
    .describe('A ground texture (stone, wood, grass, dirt, sand, cobble, water, rock) or a #colour'),
  floorColor: z.string().optional(),
  walls: z.boolean().default(true).describe('false: a floor with no walls round it'),
  doors: z
    .array(
      z.object({
        side: z.enum(['n', 's', 'e', 'w']),
        at: num.describe('From the west end (n, s sides) or north end (e, w), in the units'),
        width: num.positive().optional().describe('Default one square'),
        kind: OpeningKindSchema.default('door'),
      }),
    )
    .default([]),
  light: z.union([LightPresetSchema, z.looseObject({ bright: num, dim: num.optional() })]).optional(),
});

const WallPathSchema = z.looseObject({
  ...named,
  points: z.array(z.tuple([num, num])).min(2),
  closed: z.boolean().optional(),
  kind: WallKindSchema.default('wall'),
});

const LightSchema = z.looseObject({ ...named, ...at, preset: LightPresetSchema.optional() });
const TileSchema = z.looseObject({ ...named, ...box, texture: z.string().optional(), color: z.string().optional() });
const TokenSchema = z.object({
  ...at,
  monster: z.string().optional(),
  actor: z.string().optional(),
  count: z.number().int().min(1).max(50).default(1),
  hidden: z.boolean().optional(),
});
const RegionSchema = z.looseObject({
  ...named,
  x: num.optional(),
  y: num.optional(),
  w: num.positive().optional(),
  h: num.positive().optional(),
  points: z
    .array(z.tuple([num, num]))
    .min(3)
    .optional(),
});
const PlacedSchema = z.looseObject({ ...named, ...at });

export const BlueprintSchema = z.object({
  units: z
    .enum(['squares', 'pixels'])
    .default('squares')
    .describe('squares: x, y count squares; a point (light, token) sits on the centre of square x, y'),
  rooms: z.array(RoomSchema).default([]),
  walls: z.array(WallPathSchema).default([]),
  lights: z.array(LightSchema).default([]),
  tiles: z.array(TileSchema).default([]),
  tokens: z.array(TokenSchema).default([]),
  regions: z.array(RegionSchema).default([]),
  sounds: z.array(PlacedSchema).default([]),
  notes: z.array(PlacedSchema).default([]),
});
export type Blueprint = z.infer<typeof BlueprintSchema>;

export interface Spawn {
  from: { kind: 'monster'; id: string; rules: string } | { kind: 'actor'; id: string };
  at: Point;
  hidden?: boolean;
}

export interface BlueprintContext {
  scene: string;
  gridSize: number;
  /** The rules edition monsters come from. */
  rules: string;
  /** Whether a scene collection ("<scene>/walls") already has this id. */
  taken: (coll: string, id: string) => boolean;
}

const TYPES = {
  walls: 'wall',
  tiles: 'tile',
  lights: 'light',
  regions: 'region',
  sounds: 'sound',
  notes: 'note',
} as const;
type Coll = keyof typeof TYPES;

/** Turns a blueprint into documents, giving each a free id and pixel coordinates. */
class Builder {
  readonly ops: Op[] = [];
  readonly spawns: Spawn[] = [];
  private made = new Set<string>();

  constructor(
    private ctx: BlueprintContext,
    private squares: boolean,
  ) {}

  get grid(): number {
    return this.ctx.gridSize;
  }

  /** A length or a grid-line coordinate in pixels. */
  len = (v: number): number => (this.squares ? v * this.ctx.gridSize : v);
  /** A point thing's coordinate: the square's centre in squares. */
  mid = (v: number): number => (this.squares ? (v + 0.5) * this.ctx.gridSize : v);
  pt = ([x, y]: readonly [number, number]): Point => [this.len(x), this.len(y)];

  /** Adds a document with a free id made from `base` (`numbered`: always with a number, "hall-wall-1"). */
  add(coll: Coll, base: string, doc: Record<string, unknown>, numbered = false): string {
    const name = `${this.ctx.scene}/${coll}`;
    const taken = (id: string) => this.made.has(`${name}/${id}`) || this.ctx.taken(name, id);
    const id = freeId(slugify(base), taken, { bare: !numbered });
    this.made.add(`${name}/${id}`);
    this.ops.push({ op: 'create', coll: name, doc: { ...doc, type: TYPES[coll], id, rev: 0 } });
    return id;
  }
}

/** Fields a blueprint item names for the builder, left out of the stored document. */
const strip = (item: Record<string, unknown>, keys: string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(item).filter(([k, v]) => !keys.includes(k) && v !== undefined));

const lightOf = (spec: NonNullable<Blueprint['rooms'][number]['light']>) =>
  typeof spec === 'string' ? LIGHT_PRESETS[spec] : spec;

/** A rect tile's look: a ground texture with its usual tint, or a plain colour. */
export function groundOf(floor: string | undefined, color: string | undefined): Record<string, unknown> {
  if (floor?.startsWith('#')) return { color: floor };
  if (floor) return { texture: floor, color: color ?? GROUND_COLORS[floor] ?? '#8a8a8a' };
  return { color: color ?? '#8a8a8a' };
}

function addRooms(b: Builder, bp: Blueprint): void {
  const lines: { lo: Point; hi: Point; owner: string; level?: string }[] = [];
  const openings: Opening[] = [];
  // Walls merge per floor: rooms on other floors (or sets of floors) never share one.
  const floors = new Map<string, Record<string, unknown>>();
  bp.rooms.forEach((room, i) => {
    const owner = room.name ?? room.id ?? `room-${i + 1}`;
    const [x, y, w, h] = [b.len(room.x), b.len(room.y), b.len(room.w), b.len(room.h)];
    if (room.floor || room.floorColor) {
      const ground = groundOf(room.floor, room.floorColor);
      b.add('tiles', `${owner}-floor`, { kind: 'rect', name: `${owner} floor`, x, y, w, h, ...ground, ...lvl(room) });
    }
    if (room.light)
      b.add('lights', `${owner}-light`, { ...lightOf(room.light), x: x + w / 2, y: y + h / 2, ...lvl(room) });
    if (!room.walls) return;
    const floor = floorKey(room);
    floors.set(floor, lvl(room));
    const corners: Point[] = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
    corners.forEach((c, k) => {
      const d = corners[(k + 1) % 4]!;
      lines.push({ lo: c, hi: d, owner, level: floor });
    });
    for (const door of room.doors) openings.push(openingOf(b, { x, y, w, h }, door, floor));
  });
  for (const seg of roomWalls(lines, openings)) {
    const kind = seg.kind === 'wall' ? {} : WALL_KINDS[seg.kind as WallKind];
    const doc = { a: seg.a, b: seg.b, ...kind, ...floors.get(seg.level ?? '') };
    b.add('walls', `${seg.owner}-${seg.kind}`, doc, true);
  }
}

interface OnFloors {
  level?: string;
  levels?: string[];
}

/** The floor fields an item carries into its documents. */
function lvl(item: OnFloors): Record<string, unknown> {
  if (item.level) return { level: item.level };
  return item.levels?.length ? { levels: item.levels } : {};
}

const floorKey = (item: OnFloors): string => item.level ?? item.levels?.join(',') ?? '';

function openingOf(
  b: Builder,
  r: { x: number; y: number; w: number; h: number },
  door: Blueprint['rooms'][number]['doors'][number],
  level?: string,
): Opening {
  const from = b.len(door.at);
  const width = b.len(door.width ?? 1);
  const side: Side = door.side;
  const horizontal = side === 'n' || side === 's';
  const line = { n: r.y, s: r.y + r.h, w: r.x, e: r.x + r.w }[side];
  const start = (horizontal ? r.x : r.y) + from;
  return { horizontal, line, lo: start, hi: start + width, kind: door.kind, level };
}

function addWalls(b: Builder, bp: Blueprint): void {
  for (const path of bp.walls) {
    const pts = path.points.map(b.pt);
    if (path.closed) pts.push(pts[0]!);
    const extra = strip(path, ['id', 'name', 'points', 'closed', 'kind']);
    const base = path.id ?? path.name ?? (path.kind === 'wall' ? 'wall' : path.kind);
    for (let i = 1; i < pts.length; i++) {
      b.add('walls', base, { a: pts[i - 1], b: pts[i], ...WALL_KINDS[path.kind], ...extra });
    }
  }
}

function addLights(b: Builder, bp: Blueprint): void {
  for (const light of bp.lights) {
    const preset = light.preset ? LIGHT_PRESETS[light.preset] : { bright: 20, dim: 20 };
    const base = light.id ?? light.name ?? light.preset ?? 'light';
    b.add('lights', base, {
      ...preset,
      ...strip(light, ['id', 'preset', 'x', 'y']),
      x: b.mid(light.x),
      y: b.mid(light.y),
    });
  }
}

function addTiles(b: Builder, bp: Blueprint): void {
  for (const tile of bp.tiles) {
    const src = tile.src as string | undefined;
    const look = src ? { kind: 'image' } : { kind: 'rect', ...groundOf(tile.texture, tile.color) };
    const place = { x: b.len(tile.x), y: b.len(tile.y), w: b.len(tile.w), h: b.len(tile.h) };
    const base = tile.id ?? tile.name ?? (src ? 'image' : (tile.texture ?? 'tile'));
    b.add('tiles', base, { ...strip(tile, ['id', 'x', 'y', 'w', 'h', 'texture', 'color']), ...look, ...place });
  }
}

function addTokens(b: Builder, bp: Blueprint, rules: string): void {
  for (const t of bp.tokens) {
    if (!t.monster === !t.actor) throw new Error('A token names a monster or an actor (one of them)');
    const from: Spawn['from'] = t.monster ? { kind: 'monster', id: t.monster, rules } : { kind: 'actor', id: t.actor! };
    for (let i = 0; i < t.count; i++) {
      const at: Point = [b.mid(t.x) + i * b.grid, b.mid(t.y)];
      b.spawns.push({ from, at, ...(t.hidden && { hidden: true }) });
    }
  }
}

function addRegions(b: Builder, bp: Blueprint): void {
  for (const r of bp.regions) {
    const points = r.points?.map(b.pt) ?? boxPoints(b, r);
    const base = r.id ?? r.name ?? 'region';
    b.add('regions', base, { behaviors: [], ...strip(r, ['id', 'x', 'y', 'w', 'h', 'points']), points });
  }
}

function boxPoints(b: Builder, r: { x?: number; y?: number; w?: number; h?: number }): Point[] {
  if (r.x === undefined || r.y === undefined || !r.w || !r.h) throw new Error('A region needs points, or x, y, w, h');
  const [x, y, w, h] = [b.len(r.x), b.len(r.y), b.len(r.w), b.len(r.h)];
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

function addPlaced(b: Builder, coll: 'sounds' | 'notes', items: Blueprint['sounds']): void {
  for (const item of items) {
    const base = item.id ?? item.name ?? (item.label as string | undefined) ?? coll.slice(0, -1);
    b.add(coll, base, { ...strip(item, ['id', 'x', 'y']), x: b.mid(item.x), y: b.mid(item.y) });
  }
}

/** The documents and creatures a blueprint makes. */
export function blueprintBuild(bp: Blueprint, ctx: BlueprintContext): { ops: Op[]; spawns: Spawn[] } {
  const b = new Builder(ctx, bp.units === 'squares');
  addTiles(b, bp);
  addRooms(b, bp);
  addWalls(b, bp);
  addLights(b, bp);
  addRegions(b, bp);
  addPlaced(b, 'sounds', bp.sounds);
  addPlaced(b, 'notes', bp.notes);
  addTokens(b, bp, ctx.rules);
  return { ops: b.ops, spawns: b.spawns };
}
