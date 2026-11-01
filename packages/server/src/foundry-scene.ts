import { type DoorState, gridSizePatch, type Light, type PlacedLight, type SceneEntry, type Tile, type Wall } from '@vtt/shared';
import { z } from 'zod';

// A Foundry VTT scene (from a module's compendium, a world, or "Export
// Data") as one of our scene entries. Foundry draws the scene's background
// inside a padding of whole squares; we keep its coordinates and put the
// background tile where Foundry draws it, so walls and lights stay on it.
// Field names changed between Foundry versions; both v9 and v10-v12 are read.

const num = z.number().optional().catch(undefined);
const str = z.string().optional().catch(undefined);

const FoundryWall = z.object({
  c: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  move: num,
  sight: num,
  /** v9's name for sight. */
  sense: num,
  door: num,
  ds: num,
});

const FoundryLight = z.object({
  x: z.number(),
  y: z.number(),
  config: z
    .object({ bright: num, dim: num, color: str.nullable(), negative: z.boolean().optional(), animation: z.object({ type: str.nullable() }).optional() })
    .optional()
    .catch(undefined),
  bright: num,
  dim: num,
  tintColor: str.nullable(),
  lightAnimation: z.object({ type: str.nullable() }).optional().catch(undefined),
});

const FoundryTile = z.object({
  texture: z.object({ src: str.nullable() }).optional().catch(undefined),
  img: str.nullable(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  sort: num,
  z: num,
  overhead: z.boolean().optional().catch(undefined),
});

const list = <T extends z.ZodType>(item: T) =>
  z
    .array(z.unknown())
    .optional()
    .catch(undefined)
    .transform((xs) => (xs ?? []).flatMap((x) => (item.safeParse(x).success ? [item.parse(x) as z.infer<T>] : [])));

const FoundrySceneSchema = z.object({
  name: z.string().min(1).catch('Imported scene'),
  width: z.number().positive().catch(4000),
  height: z.number().positive().catch(3000),
  padding: z.number().min(0).catch(0.25),
  background: z.object({ src: str.nullable() }).optional().catch(undefined),
  img: str.nullable(),
  backgroundColor: str.nullable(),
  grid: z.union([z.number(), z.object({ size: num, type: num, distance: num })]).optional().catch(undefined),
  gridType: num,
  gridDistance: num,
  darkness: num,
  environment: z.object({ darknessLevel: num }).optional().catch(undefined),
  initial: z.object({ x: z.number(), y: z.number() }).nullable().optional().catch(undefined),
  walls: list(FoundryWall),
  lights: list(FoundryLight),
  tiles: list(FoundryTile),
  tokens: z.array(z.unknown()).optional().catch(undefined),
});
type FoundryScene = z.infer<typeof FoundrySceneSchema>;

/** The `pack://` reference of a file the import copied, by its path in Foundry's data folder. */
export type MediaLookup = (foundryPath: string) => string | undefined;

export interface ConvertedScene {
  scene: Omit<SceneEntry, 'id'>;
  /** What could not come along, for the import report. */
  skipped: string[];
}

interface Grid {
  size: number;
  /** Foundry grid units per square (feet by default, 5). */
  distance: number;
  gridless: boolean;
}

function gridOf(s: FoundryScene): Grid {
  const g = typeof s.grid === 'object' ? s.grid : { size: s.grid, type: s.gridType, distance: s.gridDistance };
  return { size: Math.max(10, Math.round(g.size ?? 100)), distance: g.distance || 5, gridless: (g.type ?? s.gridType) === 0 };
}

const decoded = (path: string) => {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};

const lookupIn = (media: MediaLookup) => (src: string | null | undefined) => (src ? media(decoded(src)) : undefined);

/** Converts one Foundry scene; `media` finds the copied pictures. */
export function foundryScene(data: unknown, media: MediaLookup): ConvertedScene {
  const s = FoundrySceneSchema.parse(data);
  const grid = gridOf(s);
  const pad = (side: number) => Math.ceil((side * s.padding) / grid.size) * grid.size;
  const [x, y] = [pad(s.width), pad(s.height)];
  const skipped: string[] = [];
  const background = backgroundTile(s, { x, y }, lookupIn(media), skipped);
  const scene: Omit<SceneEntry, 'id'> = {
    name: s.name,
    ...(gridSizePatch(grid.size) as { gridSize: number; chunkSize: number }),
    start: s.initial ? [s.initial.x, s.initial.y] : [x + s.width / 2, y + s.height / 2],
    darkness: Math.min(1, Math.max(0, s.environment?.darknessLevel ?? s.darkness ?? 0)),
    vision: true,
    ...(grid.gridless ? { grid: 'none' as const } : {}),
    ...(s.backgroundColor ? { background: s.backgroundColor } : {}),
    tiles: [...background, ...tilesOf(s, lookupIn(media), skipped)],
    walls: wallsOf(s, skipped),
    lights: lightsOf(s, grid),
  };
  const tokens = s.tokens?.length ?? 0;
  if (tokens) skipped.push(`${plural(tokens, 'token')} (place the creatures from the Actors tab)`);
  return { scene, skipped };
}

const plural = (n: number, what: string) => `${n} ${what}${n === 1 ? '' : 's'}`;

function backgroundTile(
  s: FoundryScene,
  at: { x: number; y: number },
  find: ReturnType<typeof lookupIn>,
  skipped: string[],
): Tile[] {
  const path = s.background?.src ?? s.img;
  const src = find(path);
  if (!src) {
    if (path) skipped.push(`the background picture, which is not in the module (${path})`);
    return [];
  }
  return [
    { id: 'background', name: 'Background', kind: 'image', ...at, w: s.width, h: s.height, src, background: true, locked: true },
  ];
}

function tilesOf(s: FoundryScene, find: ReturnType<typeof lookupIn>, skipped: string[]): Tile[] {
  const order = (t: FoundryScene['tiles'][number]) => (t.overhead ? 1e9 : 0) + (t.sort ?? t.z ?? 0);
  const sorted = [...s.tiles].sort((a, b) => order(a) - order(b));
  const out: Tile[] = [];
  const missing: string[] = [];
  for (const t of sorted) {
    const path = t.texture?.src ?? t.img;
    const src = find(path);
    if (src && t.width > 0 && t.height > 0) {
      out.push({ id: `tile-${out.length + 1}`, kind: 'image', x: t.x, y: t.y, w: t.width, h: t.height, src });
    } else missing.push(path ?? '(none)');
  }
  if (missing.length)
    skipped.push(`${plural(missing.length, 'tile')} whose picture is not in the module (${missing.join(', ')})`);
  return out;
}

const DOOR_STATES: DoorState[] = ['closed', 'open', 'locked'];

function wallsOf(s: FoundryScene, skipped: string[]): Wall[] {
  const out: Wall[] = [];
  let inert = 0;
  for (const w of s.walls) {
    const sight = w.sight ?? w.sense ?? 1;
    if (w.move === 0 && sight === 0) {
      inert++;
      continue;
    }
    const [ax, ay, bx, by] = w.c;
    const wall: Wall = { id: `wall-${out.length + 1}`, a: [ax, ay], b: [bx, by] };
    if (w.door) wall.door = DOOR_STATES[w.ds ?? 0] ?? 'closed';
    if (sight === 0) wall.sight = false;
    out.push(wall);
  }
  if (inert) skipped.push(`${plural(inert, 'wall')} that ${inert === 1 ? 'blocks' : 'block'} neither movement nor sight`);
  return out;
}

const ANIMATIONS: Record<string, Light['animation']> = { torch: 'flicker', flame: 'flicker', fairy: 'pulse', pulse: 'pulse' };

function lightsOf(s: FoundryScene, grid: Grid): PlacedLight[] {
  const feet = (units: number | undefined) => Math.round(((units ?? 0) * 5) / grid.distance);
  const out: PlacedLight[] = [];
  for (const l of s.lights) {
    const c = l.config ?? {};
    const [bright, dim] = [feet(c.bright ?? l.bright), feet(c.dim ?? l.dim)];
    if (!bright && !dim) continue;
    const color = c.color ?? l.tintColor;
    const animation = ANIMATIONS[c.animation?.type ?? l.lightAnimation?.type ?? ''];
    out.push({
      id: `light-${out.length + 1}`,
      x: l.x,
      y: l.y,
      bright,
      dim,
      ...(color ? { color } : {}),
      ...(animation ? { animation } : {}),
      ...(c.negative ? { darkness: true } : {}),
    });
  }
  return out;
}
