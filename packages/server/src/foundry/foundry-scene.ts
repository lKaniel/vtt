import { foundryWeather } from './foundry-weather.ts';
import { carried, madeFrom } from './foundry-origin.ts';
import type { ImportLoss } from '@vtt/core';
import { lost, lost as lostThings } from './import-losses.ts';
import { gridSizePatch, type SceneEntry, type Tile, type Wall } from '@vtt/shared';
import { z } from 'zod';
import { foundryList, sourceOf } from './foundry-lists.ts';
import { type Floors, foundryFloors } from './foundry-levels.ts';
import { foundryPlaceables } from './foundry-placeables.ts';
import { FoundryLight, foundryLights } from './foundry-lights.ts';
import { activeTilesNote, FoundryTile, isOverhead, lookOf, roofOf, topLeftOf } from './foundry-tiles.ts';
import { FoundryWall, wallOf } from './foundry-walls.ts';
import { mergedCopiesOf, scene3dOf, tileModelOf, tileSolidOf } from './foundry-3d.ts';
import { tileTerrainOf } from './foundry-terrain.ts';

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
  /** SmallTime's `darkness-link`: the scene darkens with the time of day. */
  flags: z
    .object({ smalltime: z.object({ 'darkness-link': z.boolean().optional() }).optional().catch(undefined) })
    .optional()
    .catch(undefined),
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
  /** The Foundry version that last saved it: from v14 tiles stand by their anchor. */
  _stats: z.object({ coreVersion: str }).optional().catch(undefined),
});
type FoundryScene = z.infer<typeof FoundrySceneSchema>;

/** A Foundry scene's grid: its square size, feet per square, and whether it has none. */
export const foundryGrid = (data: unknown): Grid => gridOf(FoundrySceneSchema.parse(data));

/** The `pack://` reference of a file the import copied, by its path in Foundry's data folder. */
export type MediaLookup = (foundryPath: string) => string | undefined;

export interface ConvertedScene {
  scene: Omit<SceneEntry, 'id'>;
  /** What could not come along, for the import report. */
  skipped: ImportLoss[];
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
  /** The caller turns Monk's Active Tiles into triggers itself (the world import), so they aren't reported here. */
  keepsTriggers?: boolean;
}

/** Converts one Foundry scene; `media` finds the copied pictures and sounds. */
export function foundryScene(data: unknown, media: MediaLookup, lookups: SceneLookups = {}): ConvertedScene {
  const s = FoundrySceneSchema.parse(data);
  const grid = gridOf(s);
  const pad = (side: number) => Math.ceil((side * s.padding) / grid.size) * grid.size;
  const [x, y] = [pad(s.width), pad(s.height)];
  const skipped: ImportLoss[] = [];
  const floors = foundryFloors(data, feetIn(grid));
  const on = (item: object) => floors?.on(sourceOf(item)) ?? {};
  const background = backgroundTile(s, { x, y }, lookupIn(media), skipped);
  const { skipped: lost, ...placeables } = foundryPlaceables(data, {
    grid,
    media: (p) => media(decoded(p)),
    floors,
    ...lookups,
  });
  skipped.push(...lost);
  const sky = foundryWeather(data);
  skipped.push(...sky.skipped);
  const scene: Omit<SceneEntry, 'id'> = {
    name: s.name,
    ...(gridSizePatch(grid.size) as { gridSize: number; chunkSize: number }),
    start: s.initial ? [s.initial.x, s.initial.y] : [x + s.width / 2, y + s.height / 2],
    ...darknessOf(s),
    vision: true,
    ...(grid.gridless ? { grid: 'none' as const } : {}),
    ...(s.backgroundColor ? { background: s.backgroundColor } : {}),
    ...navOf(s, lookupIn(media)),
    ...(floors ? { levels: floors.levels } : {}),
    ...view3dOf(data, media),
    ...(sky.weather ? { weather: sky.weather } : {}),
    tiles: [
      ...background,
      ...floorBackgrounds(s, { x, y }, lookupIn(media), floors),
      ...tilesOf(s, {
        find: lookupIn(media),
        skipped,
        on,
        grid,
        keepsTriggers: lookups.keepsTriggers,
        anchored: isV14(s),
      }),
      ...foregroundTile(s, { x, y }, lookupIn(media)),
    ],
    walls: wallsOf(s, grid, skipped, on),
    lights: foundryLights(s.lights, feetIn(grid), on),
    ...placeables,
  };
  const tokens = s.tokens?.length ?? 0;
  if (tokens && !lookups.keepsTokens)
    skipped.push(lostThings('Tokens (place the creatures from the Actors tab)', tokens));
  return { scene, skipped };
}

/** Saved by Foundry v14 or later. */
const isV14 = (s: FoundryScene) => Number(s._stats?.coreVersion?.split('.')[0] ?? 0) >= 14;

/** Foundry grid units in feet, rounded. */
const feetIn = (grid: Grid) => (units: number) => Math.round((units * 5) / grid.distance);

function backgroundTile(
  s: FoundryScene,
  at: { x: number; y: number },
  find: ReturnType<typeof lookupIn>,
  skipped: ImportLoss[],
): Tile[] {
  const path = s.background?.src ?? s.img ?? levelBackground(s.levels);
  const src = find(path);
  if (!src) {
    if (path) skipped.push(lost('Background pictures that could not be found', 1, [path]));
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
  _id: str,
  name: str,
  elevation: z.object({ bottom: num }).optional().catch(undefined),
  background: z.object({ src: str.nullable() }).optional().catch(undefined),
});

/** How dark it is; whether it darkens with the time of day (SmallTime linked it to the clock). */
function darknessOf(s: FoundryScene): Pick<SceneEntry, 'darkness' | 'darknessFollowsClock'> {
  const darkness = Math.min(1, Math.max(0, s.environment?.darknessLevel ?? s.darkness ?? 0));
  return s.flags?.smalltime?.['darkness-link'] ? { darkness, darknessFollowsClock: true } : { darkness };
}

/** v14 floors with pictures of their own, above the lowest: each as a background tile on its floor. */
function floorBackgrounds(
  s: FoundryScene,
  at: { x: number; y: number },
  find: ReturnType<typeof lookupIn>,
  floors: Floors | undefined,
): Tile[] {
  if (!floors) return [];
  const lowest = levelBackground(s.levels);
  const parsed = (s.levels ?? []).flatMap((l) => FoundryLevel.safeParse(l).data ?? []);
  return parsed.flatMap((l, i) => {
    const path = l.background?.src;
    const src = path && path !== lowest ? find(path) : undefined;
    if (!src || !l._id) return [];
    const where = floors.on({ levels: [l._id] });
    return [
      {
        id: `floor-${i + 1}`,
        name: l.name ?? 'Floor',
        kind: 'image' as const,
        ...at,
        w: s.width,
        h: s.height,
        src,
        locked: true,
        ...where,
      },
    ];
  });
}

/** v14 keeps the background on the scene's floors: the lowest one that has a picture. */
function levelBackground(levels: unknown[] | undefined): string | undefined {
  const floors = (levels ?? []).flatMap((l) => FoundryLevel.safeParse(l).data ?? []);
  const bottom = (l: (typeof floors)[number]) => l.elevation?.bottom ?? 0;
  return [...floors].sort((a, b) => bottom(a) - bottom(b)).find((l) => l.background?.src)?.background?.src ?? undefined;
}

/** 3D Canvas puts its models on the map as tiles of a blank picture. */
const is3dModel = (path: string | null | undefined) => !!path && /levels-3d-preview\/.*blank\.webp$/.test(path);

/** A tile 3D Canvas draws: its blank picture, or no picture and a 3D Canvas shape or model (terrain often has none). */
function is3dTile(t: FoundryScene['tiles'][number]): boolean {
  const path = t.texture?.src ?? t.img;
  if (path) return is3dModel(path);
  const mesh = flagOf(t, 'dynaMesh');
  return !!flagOf(t, 'model3d') || (typeof mesh === 'string' && mesh !== 'default');
}

/** The picture of a model tile: nothing, on the 2D map. */
export const BLANK = '/art/ui/blank.svg';

/** A 3D Canvas scene's sky and table, as `view3d`. */
function view3dOf(data: unknown, media: MediaLookup): Pick<SceneEntry, 'view3d'> {
  const view3d = scene3dOf(data, (p) => media(decoded(p)));
  return view3d ? { view3d } : {};
}

interface TileContext {
  find: ReturnType<typeof lookupIn>;
  skipped: ImportLoss[];
  on: OnFloors;
  grid: Grid;
  keepsTriggers?: boolean;
  /** Tiles stand by their anchor (v14). */
  anchored: boolean;
}

/** What a 3D Canvas tile stands in 3D: a model, else terrain (a heightmap), else a solid (a drawn shape). */
function made3d(t: FoundryScene['tiles'][number], c: TileContext) {
  const find = (p: string) => c.find(p);
  const model = tileModelOf(sourceOf(t), c.grid, find);
  if (model) return { model };
  const terrain = tileTerrainOf(sourceOf(t), c.grid, find);
  if (terrain) return { terrain };
  // A heightmap that did not come along is not a box as tall as its hills.
  if (flagOf(t, 'displacementMap')) return undefined;
  const solid = tileSolidOf(sourceOf(t), c.grid);
  return solid && { solid };
}

const flagOf = (t: FoundryScene['tiles'][number], key: string) =>
  (sourceOf(t) as { flags?: { 'levels-3d-preview'?: Record<string, unknown> } }).flags?.['levels-3d-preview']?.[key];

/** A 3D Canvas tile as model tiles (a glTF model that came along; a merged tile's copies), terrain or a solid, if any. */
function tile3d(t: FoundryScene['tiles'][number], c: TileContext): Tile[] | undefined {
  const made = made3d(t, c);
  if (!made) return undefined;
  const at = topLeftOf(t, c.anchored);
  const tile = { id: '', kind: 'image' as const, ...at, w: t.width, h: t.height, src: BLANK, ...c.on(t) };
  const model = 'model' in made ? made.model : undefined;
  const copies = model && mergedCopiesOf(sourceOf(t), c.grid);
  if (!model || !copies) return [madeFrom({ ...tile, ...made }, sourceOf(t))];
  return copies.map((copy, i) => {
    const { rotation: _r, tilt: _t, ...base } = model;
    const elevation = (model.elevation ?? 0) + copy.rise;
    const one: Tile = {
      ...tile,
      x: at.x + copy.rect.x,
      y: at.y + copy.rect.y,
      w: Math.max(1, copy.rect.w),
      h: Math.max(1, copy.rect.h),
      model: { ...base, ...copy.model, ...(elevation ? { elevation } : {}) },
    };
    return i === 0 ? madeFrom(one, sourceOf(t)) : one;
  });
}

/** 3D Canvas tiles as model tiles or solids; those we can't draw, reported. */
function modelTiles(tiles: FoundryScene['tiles'], c: TileContext): Tile[] {
  const out: Tile[] = [];
  let lost = 0;
  for (const t of tiles) {
    if (!is3dTile(t) || t.width <= 0 || t.height <= 0) continue;
    const made = tile3d(t, c);
    if (made) out.push(...made);
    else lost++;
  }
  const what =
    "3D Canvas tiles without a glTF model or heightmap in the Data folder, or a shape we can't draw (cones, spheres)";
  if (lost) c.skipped.push(lostThings(what, lost));
  return out;
}

/** Where an item is among the scene's floors. */
type OnFloors = (item: object) => { level?: string; levels?: string[] };

function tilesOf(s: FoundryScene, c: TileContext): Tile[] {
  const { find, skipped, on } = c;
  const fg = s.foregroundElevation;
  const order = (t: FoundryScene['tiles'][number]) => (isOverhead(t, fg) ? 1e9 : 0) + (t.sort ?? t.z ?? 0);
  const sorted = [...s.tiles].sort((a, b) => order(a) - order(b));
  const out: Tile[] = modelTiles(sorted, c);
  const missing: string[] = [];
  const triggers = c.keepsTriggers ? undefined : activeTilesNote(sorted);
  if (triggers) skipped.push(triggers);
  for (const t of sorted) {
    const path = t.texture?.src ?? t.img;
    if (is3dTile(t)) continue;
    const src = find(path);
    if (src && t.width > 0 && t.height > 0) {
      const tile: Tile = {
        id: '',
        kind: 'image',
        ...topLeftOf(t, c.anchored),
        w: t.width,
        h: t.height,
        src,
        ...lookOf(t),
        ...roofOf(t, fg),
        ...on(t),
      };
      out.push(madeFrom(tile, sourceOf(t)));
    } else missing.push(path ?? '(none)');
  }
  if (missing.length) skipped.push(lost('Tiles whose picture could not be found', missing.length, missing));
  return out.map((t, i) => carried(t, { ...t, id: `tile-${i + 1}` }));
}

function wallsOf(s: FoundryScene, grid: Grid, skipped: ImportLoss[], on: OnFloors): Wall[] {
  const walls = s.walls.flatMap((w) => {
    const wall = wallOf(w, feetIn(grid));
    return wall ? [madeFrom({ ...wall, ...on(w) }, sourceOf(w))] : [];
  });
  const inert = s.walls.length - walls.length;
  if (inert) skipped.push(lost('Walls that stop nothing', inert));
  return walls.map((wall, i) => carried(wall, { id: `wall-${i + 1}`, ...wall }));
}
