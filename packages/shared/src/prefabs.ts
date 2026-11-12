import { z } from 'zod';
import { IdSchema as id, PlacedLightSchema, TileSchema, WallSchema } from './schema.ts';
import { DrawingSchema, NoteSchema, SoundSchema } from './scene-items.ts';

// A prefab: things drawn and built together (a lamppost and its light, a
// tent and its walls, a house and its doors), placed on a scene as one.
// Baileywiki's Mass Edit presets import as these (baileywiki-modules.ts on
// the server). Coordinates are where they were made; placing moves them so
// their middle lands where the GM drops it.

/** A range, smallest first, a placing picks a number in. */
const Range = z.tuple([z.number(), z.number()]);

/** How each placing differs: a random size, turn, tint or picture, as Baileywiki's randomised presets do. */
export const PrefabVarySchema = z.object({
  /** Times its size. */
  scale: Range.optional(),
  /** Degrees turned clockwise. */
  rotation: Range.optional(),
  /** One of these colours multiplied into its pictures. */
  tint: z.array(z.string()).min(1).optional(),
  /** One of these pictures instead of its own (tiles only). */
  pictures: z.array(z.string()).min(1).optional(),
});
export type PrefabVary = z.infer<typeof PrefabVarySchema>;

export const PrefabSchema = z
  .object({
    id,
    name: z.string().min(1),
    /** Search words for the prefab browser. */
    tags: z.array(z.string()).optional(),
    /** A picture of it for the browser. */
    thumb: z.string().optional(),
    tiles: z.array(TileSchema).default([]),
    walls: z.array(WallSchema).default([]),
    lights: z.array(PlacedLightSchema).default([]),
    sounds: z.array(SoundSchema).default([]),
    drawings: z.array(DrawingSchema).default([]),
    notes: z.array(NoteSchema).default([]),
    /** "one": a brush, each placing puts down one of its tiles at random; "all" (the default) puts down everything. */
    pick: z.enum(['all', 'one']).optional(),
    vary: PrefabVarySchema.optional(),
    /** It covers the whole scene when placed (fog, weather, terrain overlays). */
    fill: z.boolean().optional(),
  })
  .refine(
    (p) => p.tiles.length + p.walls.length + p.lights.length + p.sounds.length + p.drawings.length + p.notes.length > 0,
    {
      message: 'a prefab needs something to place',
    },
  );
export type Prefab = z.infer<typeof PrefabSchema>;

export interface PlaceOptions {
  /** A number in [0, 1): Math.random, or a fixed one in tests. */
  random: () => number;
  /** The scene's area, for a prefab that fills it. */
  scene?: { x: number; y: number; w: number; h: number };
}

type Pt = [number, number];
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const within = ([min, max]: [number, number], r: number) => min + (max - min) * r;
const oneOf = <T>(list: readonly T[], r: number): T => list[Math.min(list.length - 1, Math.floor(r * list.length))]!;

/** The box round its tiles, or round its points when it has none. */
function boundsOf(p: Prefab): Box {
  const boxes: Box[] = p.tiles.flatMap((t) => (t.kind === 'group' ? [] : [t]));
  const points: Pt[] = [
    ...p.walls.flatMap((w) => [w.a, w.b] as Pt[]),
    ...[...p.lights, ...p.sounds, ...p.notes].map((l): Pt => [l.x, l.y]),
  ];
  const xs = [...boxes.flatMap((b) => [b.x, b.x + b.w]), ...(boxes.length ? [] : points.map((q) => q[0]))];
  const ys = [...boxes.flatMap((b) => [b.y, b.y + b.h]), ...(boxes.length ? [] : points.map((q) => q[1]))];
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** How one placing moves points: scaled by `k` and turned `deg` clockwise about `c`. */
function transform(c: Pt, k: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  const [cos, sin] = [Math.cos(rad), Math.sin(rad)];
  return ([x, y]: Pt): Pt => {
    const [dx, dy] = [(x - c[0]) * k, (y - c[1]) * k];
    return [c[0] + dx * cos - dy * sin, c[1] + dx * sin + dy * cos];
  };
}

/** What a placing picks: one tile of a brush, a size, a turn, a tint and a picture. */
function picks(p: Prefab, random: () => number) {
  const tiles = p.pick === 'one' && p.tiles.length ? [oneOf(p.tiles, random())] : p.tiles;
  const { vary } = p;
  return {
    tiles,
    rest: p.pick === 'one',
    k: vary?.scale ? within(vary.scale, random()) : 1,
    deg: vary?.rotation ? Math.round(within(vary.rotation, random())) : 0,
    tint: vary?.tint ? oneOf(vary.tint, random()) : undefined,
    picture: vary?.pictures ? oneOf(vary.pictures, random()) : undefined,
  };
}

type Picked = ReturnType<typeof picks>;
type Move = (p: Pt) => Pt;

function placeTile(t: Prefab['tiles'][number], move: Move, pick: Picked): Record<string, unknown> {
  if (t.kind === 'group') return { ...t };
  const [cx, cy] = move([t.x + t.w / 2, t.y + t.h / 2]);
  const [w, h] = [t.w * pick.k, t.h * pick.k];
  return { ...t, x: cx - w / 2, y: cy - h / 2, w, h, ...(t.kind === 'image' ? lookOf(t, pick) : {}) };
}

/** An image tile's turn, tint and picture after a placing; a model turns and grows instead of its picture. */
function lookOf(t: Extract<Prefab['tiles'][number], { kind: 'image' }>, pick: Picked) {
  const turned = (deg = 0) => (deg + pick.deg) % 360;
  if (t.model) {
    const height = t.model.height && t.model.height * pick.k;
    return {
      model: { ...t.model, ...(pick.deg ? { rotation: turned(t.model.rotation) } : {}), ...(height ? { height } : {}) },
    };
  }
  return {
    ...(pick.deg ? { rotation: turned(t.rotation) } : {}),
    ...(pick.tint ? { tint: pick.tint } : {}),
    ...(pick.picture ? { src: pick.picture } : {}),
  };
}

const scaled = (v: number | undefined, k: number) => (v === undefined ? undefined : v * k);

function placeLight(l: Prefab['lights'][number], move: Move, pick: Picked): Record<string, unknown> {
  const [x, y] = move([l.x, l.y]);
  const rotation = l.rotation === undefined ? undefined : l.rotation + pick.deg;
  return {
    ...l,
    x,
    y,
    bright: l.bright * pick.k,
    dim: scaled(l.dim, pick.k),
    ...(rotation === undefined ? {} : { rotation }),
  };
}

/** A fill prefab stretched over the scene: its tiles cover the scene's area. */
function fillDocs(p: Prefab, scene: Box) {
  return p.tiles.map((t) => ({ ...t, ...(t.kind === 'group' ? {} : scene), type: 'tile', rev: 0 }));
}

/**
 * The documents one placing of `p` makes, where it was made (paste them
 * where the GM drops it): more than one tile go in a group named after
 * it, and its walls and lights are fastened to the group (or its tile), so
 * they move, copy and delete with it.
 */
export function prefabClip(
  p: Prefab,
  o: PlaceOptions,
): { docs: (Record<string, unknown> & { id: string; type: string; rev: number })[] } {
  if (p.fill && o.scene) return { docs: fillDocs(p, o.scene) };
  const pick = picks(p, o.random);
  const b = boundsOf({ ...p, tiles: pick.tiles });
  const move = transform([b.x + b.w / 2, b.y + b.h / 2], pick.k, pick.deg);
  const loose = pick.tiles.filter((t) => !t.parent);
  const group = loose.length > 1 ? `${p.id}-group` : undefined;
  const holder = group ?? loose[0]?.id;
  const fasten = holder ? { tile: holder } : {};
  const doc = <T extends object>(type: string, d: T) =>
    ({ ...d, type, rev: 0 }) as T & { id: string; type: string; rev: number };
  const tiles = pick.tiles.map((t) =>
    doc('tile', { ...placeTile(t, move, pick), ...(group && !t.parent ? { parent: group } : {}) }),
  );
  const rest = pick.rest
    ? []
    : [
        ...p.walls.map((w) => doc('wall', { ...w, a: move(w.a), b: move(w.b), ...fasten })),
        ...p.lights.map((l) => doc('light', { ...placeLight(l, move, pick), ...fasten })),
        ...p.sounds.map((s) => doc('sound', { ...s, ...pointAt(move, s) })),
        ...p.notes.map((n) => doc('note', { ...n, ...pointAt(move, n) })),
        ...p.drawings.map((d) => doc('drawing', d)),
      ];
  const head = group ? [doc('tile', { id: group, kind: 'group', name: p.name })] : [];
  return { docs: [...head, ...tiles, ...rest] };
}

const pointAt = (move: Move, at: { x: number; y: number }) => {
  const [x, y] = move([at.x, at.y]);
  return { x, y };
};
