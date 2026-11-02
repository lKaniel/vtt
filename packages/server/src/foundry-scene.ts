import { gridSizePatch, type SceneEntry, type Tile, type Wall } from '@vtt/shared';
import { z } from 'zod';
import { foundryList } from './foundry-lists.ts';
import { foundryPlaceables } from './foundry-placeables.ts';
import { FoundryLight, foundryLights } from './foundry-lights.ts';
import { FoundryTile, isOverhead, roofOf } from './foundry-tiles.ts';
import { FoundryWall, wallOf } from './foundry-walls.ts';

// A Foundry VTT scene (from a module's compendium, a world, or "Export
// Data") as one of our scene entries. Foundry draws the scene's background
// inside a padding of whole squares; we keep its coordinates and put the
// background tile where Foundry draws it, so walls and lights stay on it.
// Field names changed between Foundry versions; both v9 and v10-v12 are read.

const num = z.number().optional().catch(undefined);
const str = z.string().optional().catch(undefined);

const list = foundryList;

const FoundrySceneSchema = z.object({
  name: z.string().min(1).catch('Imported scene'),
  width: z.number().positive().catch(4000),
  height: z.number().positive().catch(3000),
  padding: z.number().min(0).catch(0.25),
  background: z.object({ src: str.nullable() }).optional().catch(undefined),
  img: str.nullable(),
  /** v14: floors, each with its own background picture. */
  levels: z.array(z.unknown()).optional().catch(undefined),
  backgroundColor: str.nullable(),
  grid: z
    .union([z.number(), z.object({ size: num, type: num, distance: num })])
    .optional()
    .catch(undefined),
  gridType: num,
  gridDistance: num,
  darkness: num,
  environment: z.object({ darknessLevel: num }).optional().catch(undefined),
  foregroundElevation: num,
  /** A picture drawn over the map, where the background is. */
  foreground: str.nullable(),
  navigation: z.boolean().optional().catch(undefined),
  navName: str.nullable(),
  thumb: str.nullable(),
  initial: z.object({ x: z.number(), y: z.number() }).nullable().optional().catch(undefined),
  walls: list(FoundryWall),
  lights: list(FoundryLight),
  tiles: list(FoundryTile),
  tokens: z.array(z.unknown()).optional().catch(undefined),
});
type FoundryScene = z.infer<typeof FoundrySceneSchema>;

/** A Foundry scene's grid: its square size, feet per square, and whether it has none. */
export const foundryGrid = (data: unknown): Grid => gridOf(FoundrySceneSchema.parse(data));

/** The `pack://` reference of a file the import copied, by its path in Foundry's data folder. */
export type MediaLookup = (foundryPath: string) => string | undefined;

export interface ConvertedScene {
  scene: Omit<SceneEntry, 'id'>;
  /** What could not come along, for the import report. */
  skipped: string[];
}

export interface Grid {
  size: number;
  /** Foundry grid units per square (feet by default, 5). */
  distance: number;
  gridless: boolean;
}

function gridOf(s: FoundryScene): Grid {
  const g = typeof s.grid === 'object' ? s.grid : { size: s.grid, type: s.gridType, distance: s.gridDistance };
  return {
    size: Math.max(10, Math.round(g.size ?? 100)),
    distance: g.distance && g.distance > 0 ? g.distance : 5,
    gridless: (g.type ?? s.gridType) === 0,
  };
}

const decoded = (path: string) => {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};

const lookupIn = (media: MediaLookup) => (src: string | null | undefined) => (src ? media(decoded(src)) : undefined);

/** Our ids for the journal entries and pages brought along with the scene, for its map notes. */
export interface SceneLookups {
  entries?: (foundryId: string) => string | undefined;
  pages?: (foundryId: string) => string | undefined;
  /** The caller places the tokens itself (a world import), so they aren't reported as left out. */
  keepsTokens?: boolean;
}

/** Converts one Foundry scene; `media` finds the copied pictures and sounds. */
export function foundryScene(data: unknown, media: MediaLookup, lookups: SceneLookups = {}): ConvertedScene {
  const s = FoundrySceneSchema.parse(data);
  const grid = gridOf(s);
  const pad = (side: number) => Math.ceil((side * s.padding) / grid.size) * grid.size;
  const [x, y] = [pad(s.width), pad(s.height)];
  const skipped: string[] = [];
  const background = backgroundTile(s, { x, y }, lookupIn(media), skipped);
  const { skipped: lost, ...placeables } = foundryPlaceables(data, {
    grid,
    media: (p) => media(decoded(p)),
    ...lookups,
  });
  skipped.push(...lost);
  const scene: Omit<SceneEntry, 'id'> = {
    name: s.name,
    ...(gridSizePatch(grid.size) as { gridSize: number; chunkSize: number }),
    start: s.initial ? [s.initial.x, s.initial.y] : [x + s.width / 2, y + s.height / 2],
    darkness: Math.min(1, Math.max(0, s.environment?.darknessLevel ?? s.darkness ?? 0)),
    vision: true,
    ...(grid.gridless ? { grid: 'none' as const } : {}),
    ...(s.backgroundColor ? { background: s.backgroundColor } : {}),
    ...navOf(s, lookupIn(media)),
    tiles: [...background, ...tilesOf(s, lookupIn(media), skipped), ...foregroundTile(s, { x, y }, lookupIn(media))],
    walls: wallsOf(s, grid, skipped),
    lights: foundryLights(s.lights, feetIn(grid)),
    ...placeables,
  };
  const tokens = s.tokens?.length ?? 0;
  if (tokens && !lookups.keepsTokens)
    skipped.push(`${plural(tokens, 'token')} (place the creatures from the Actors tab)`);
  return { scene, skipped };
}

/** Foundry grid units in feet, rounded. */
const feetIn = (grid: Grid) => (units: number) => Math.round((units * 5) / grid.distance);

const plural = (n: number, what: string) => `${n} ${what}${n === 1 ? '' : 's'}`;

function backgroundTile(
  s: FoundryScene,
  at: { x: number; y: number },
  find: ReturnType<typeof lookupIn>,
  skipped: string[],
): Tile[] {
  const path = s.background?.src ?? s.img ?? levelBackground(s.levels);
  const src = find(path);
  if (!src) {
    if (path) skipped.push(`the background picture, which is not in the module (${path})`);
    return [];
  }
  return [
    {
      id: 'background',
      name: 'Background',
      kind: 'image',
      ...at,
      w: s.width,
      h: s.height,
      src,
      background: true,
      locked: true,
    },
  ];
}

/** The foreground picture, as a roof over the whole map that never fades. */
function foregroundTile(s: FoundryScene, at: { x: number; y: number }, find: ReturnType<typeof lookupIn>): Tile[] {
  const src = find(s.foreground);
  if (!src) return [];
  const [w, h] = [s.width, s.height];
  return [
    {
      id: 'foreground',
      name: 'Foreground',
      kind: 'image',
      ...at,
      w,
      h,
      src,
      overhead: true,
      occludedAlpha: 1,
      locked: true,
    },
  ];
}

/** Whether the scene shows in the navigation bar, its name there, and its thumbnail. */
function navOf(s: FoundryScene, find: ReturnType<typeof lookupIn>): Partial<SceneEntry> {
  const thumb = find(s.thumb);
  return {
    ...(s.navigation ? { navigation: true } : {}),
    ...(s.navName ? { navName: s.navName } : {}),
    ...(thumb ? { thumb } : {}),
  };
}

const FoundryLevel = z.object({
  elevation: z.object({ bottom: num }).optional().catch(undefined),
  background: z.object({ src: str.nullable() }).optional().catch(undefined),
});

/** v14 keeps the background on the scene's floors: the lowest one that has a picture. */
function levelBackground(levels: unknown[] | undefined): string | undefined {
  const floors = (levels ?? []).flatMap((l) => FoundryLevel.safeParse(l).data ?? []);
  const bottom = (l: (typeof floors)[number]) => l.elevation?.bottom ?? 0;
  return [...floors].sort((a, b) => bottom(a) - bottom(b)).find((l) => l.background?.src)?.background?.src ?? undefined;
}

/** 3D Canvas puts its models on the map as tiles of a blank picture. */
const is3dModel = (path: string | null | undefined) => !!path && /levels-3d-preview\/.*blank\.webp$/.test(path);

function tilesOf(s: FoundryScene, find: ReturnType<typeof lookupIn>, skipped: string[]): Tile[] {
  const fg = s.foregroundElevation;
  const order = (t: FoundryScene['tiles'][number]) => (isOverhead(t, fg) ? 1e9 : 0) + (t.sort ?? t.z ?? 0);
  const sorted = [...s.tiles].sort((a, b) => order(a) - order(b));
  const out: Tile[] = [];
  const missing: string[] = [];
  const models = sorted.filter((t) => is3dModel(t.texture?.src ?? t.img)).length;
  if (models) skipped.push(`${plural(models, '3D Canvas model tile')} (3D only, they show as blank squares)`);
  for (const t of sorted) {
    const path = t.texture?.src ?? t.img;
    if (is3dModel(path)) continue;
    const src = find(path);
    if (src && t.width > 0 && t.height > 0) {
      const id = `tile-${out.length + 1}`;
      out.push({ id, kind: 'image', x: t.x, y: t.y, w: t.width, h: t.height, src, ...roofOf(t, fg) });
    } else missing.push(path ?? '(none)');
  }
  if (missing.length)
    skipped.push(`${plural(missing.length, 'tile')} whose picture is not in the module (${missing.join(', ')})`);
  return out;
}

function wallsOf(s: FoundryScene, grid: Grid, skipped: string[]): Wall[] {
  const walls = s.walls.flatMap((w) => wallOf(w, feetIn(grid)) ?? []);
  const inert = s.walls.length - walls.length;
  if (inert) skipped.push(`${plural(inert, 'wall')} that ${inert === 1 ? 'stops' : 'stop'} nothing`);
  return walls.map((wall, i) => ({ id: `wall-${i + 1}`, ...wall }));
}
