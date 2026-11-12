import { type AssetQuery, type Doc, type Op, type PackAsset } from '@vtt/core';
import {
  newSceneOps,
  onLevel,
  type OnLevels,
  type Player,
  SCENE_COLLECTIONS,
  type SceneLevel,
  SceneLevelSchema,
  View3DSettingsSchema,
  tokenLevel,
} from '@vtt/shared';
import { type ClientMessage, toEdition } from '@vtt/system-dnd5e';
import { z } from 'zod';
import type { Game } from '../game.ts';
import type { McpContent, McpTool } from './mcp-protocol.ts';
import { act, ask, look, outcome, type Welcome } from './mcp-seat.ts';
import { assetQueries, chooseAsset, type FindAssets, patternLook } from './blueprint-assets.ts';
import type { BridgeTable } from './mcp-tools.ts';
import { BlueprintSchema, blueprintBuild, groundOf, type Spawn } from './scene-blueprint.ts';
import { type Box, sceneSketch } from './scene-picture.ts';

// Claude's scene tools: make a scene, build on it from a blueprint (rooms,
// walls, doors, lights, floors, creatures, regions), read it back item by
// item or as a picture, clear part of it, and take the table there. They
// send what the GM's browser would (`ops`, `build`, `viewScene`), so the
// server checks them and every build is one undo step.

const ON = {
  game: z.string().optional().describe('The game id (from list_games); leave out for your default game.'),
  scene: z.string().optional().describe('The scene id; leave out for the scene you are on.'),
};

const AREA = {
  units: z.enum(['squares', 'pixels']).default('squares'),
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
};

interface Seat {
  game: Game;
  player: Player;
  welcome: Welcome;
  scene: string;
}

/** A Source over the welcome's documents, for the shared scene helpers. */
const sourceOf = (w: Welcome) => ({
  all: (coll: string): Doc[] => w.docs?.[coll] ?? [],
  get: (coll: string, id: string): Doc | undefined => w.docs?.[coll]?.find((d) => d.id === id),
});

function sceneDoc(w: Welcome, scene: string): Doc {
  const doc = sourceOf(w).get('scenes', scene);
  if (!doc)
    throw new Error(
      `No scene "${scene}" (scenes: ${sourceOf(w)
        .all('scenes')
        .map((d) => d.id)
        .join(', ')})`,
    );
  return doc;
}

/** The scene's documents by collection. */
function itemsOf(w: Welcome, scene: string): Record<string, Doc[]> {
  return Object.fromEntries(SCENE_COLLECTIONS.map((c) => [c, sourceOf(w).all(`${scene}/${c}`)]));
}

const counts = (items: Record<string, Doc[]>) =>
  Object.fromEntries(Object.entries(items).flatMap(([c, l]) => (l.length ? [[c, l.length]] : [])));

const CreateSchema = z.object({
  game: ON.game,
  name: z.string().min(1).max(80),
  width: z.number().int().positive().max(500).optional().describe('Squares across, for the ground and the camera'),
  height: z.number().int().positive().max(500).optional(),
  grid: z.enum(['none', 'square', 'hex-rows', 'hex-cols']).optional().describe('Default none: free movement'),
  gridSize: z.number().int().min(10).max(1000).optional().describe('Pixels per 5 ft square, default 100'),
  ground: z
    .string()
    .optional()
    .describe('Ground texture (grass, dirt, sand, stone, cobble, wood, water, rock) or a #colour'),
  darkness: z.number().min(0).max(1).optional().describe('0 day to 1 night; set it to stop following the clock'),
  background: z.string().optional().describe('Colour where nothing is drawn'),
  show: z.boolean().default(false).describe('Take your own view there (the players stay put)'),
  view: z
    .enum(['2d', '3d'])
    .optional()
    .describe('"3d": a 3D scene, seen by everyone in the 3D view (for models and terrain); default "2d", a flat map'),
  view3d: View3DSettingsSchema.optional().describe(
    'How a 3D scene looks: sky (an equirectangular picture), ground (colour beyond the map), walls (false when models are the walls)',
  ),
  levels: z
    .array(SceneLevelSchema)
    .optional()
    .describe(
      'Floors, bottom up: {id, name, bottom (feet), top?, sees? (floors seen from it)}; see guide "Scene levels"',
    ),
});
type Create = z.infer<typeof CreateSchema>;

function groundTile(scene: string, a: Create, grid: number, texture?: PackAsset): Op[] {
  if (!a.ground || !a.width || !a.height) return [];
  const painted = { ...groundOf(a.ground, undefined), ...(!a.ground.startsWith('#') && { edge: 'straight' }) };
  const look = texture ? { ...patternLook(texture), edge: 'straight' } : painted;
  const size = { x: 0, y: 0, w: a.width * grid, h: a.height * grid };
  const doc = {
    type: 'tile',
    id: 'ground',
    rev: 0,
    kind: 'rect',
    name: 'Ground',
    ...size,
    background: true,
    locked: true,
    ...look,
  };
  return [{ op: 'create', coll: `${scene}/tiles`, doc }];
}

function createOps(w: Welcome, a: Create, texture?: PackAsset): { id: string; ops: Op[] } {
  const { id, ops } = newSceneOps(sourceOf(w), a.name);
  const grid = a.gridSize ?? 100;
  const doc = (ops[0] as Extract<Op, { op: 'create' }>).doc;
  Object.assign(doc, {
    gridSize: grid,
    chunkSize: grid * Math.max(1, Math.round(2000 / grid)),
    ...(a.width && a.height && { start: [(a.width * grid) / 2, (a.height * grid) / 2] }),
    ...(a.grid && a.grid !== 'none' && { grid: a.grid }),
    ...(a.darkness !== undefined && { darkness: a.darkness, darknessFollowsClock: false }),
    ...(a.background && { background: a.background }),
    ...(a.levels?.length && { levels: a.levels }),
    ...(a.view && { view: a.view }),
    ...(a.view3d && { view3d: a.view3d }),
  });
  return { id, ops: [...ops, ...groundTile(id, a, grid, texture)] };
}

/** Whether a document lies wholly inside the box. */
function inside(d: Doc, b: Box): boolean {
  const pts: [number, number][] = [];
  if (Array.isArray(d.a) && Array.isArray(d.b)) pts.push(d.a as [number, number], d.b as [number, number]);
  else if (Array.isArray(d.points)) pts.push(...(d.points as [number, number][]));
  else if (typeof d.x === 'number' && typeof d.y === 'number') {
    pts.push([d.x, d.y], [d.x + (typeof d.w === 'number' ? d.w : 0), d.y + (typeof d.h === 'number' ? d.h : 0)]);
  }
  return pts.length > 0 && pts.every(([x, y]) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
}

function summary(ops: readonly Op[], spawns: readonly Spawn[]): string {
  const made = new Map<string, string[]>();
  for (const op of ops) {
    if (op.op !== 'create') continue;
    const coll = op.coll.split('/')[1] ?? op.coll;
    made.set(coll, [...(made.get(coll) ?? []), op.doc.id]);
  }
  const parts = [...made].map(
    ([c, ids]) => `${c} ${ids.length} (${ids.slice(0, 12).join(', ')}${ids.length > 12 ? ', …' : ''})`,
  );
  if (spawns.length) parts.push(`creatures ${spawns.length}`);
  return parts.length ? `Built: ${parts.join('; ')}.` : 'Nothing to build.';
}

/** What the tools act through: the caller's seat, and sending as it. */
interface Bridge {
  seat: (a: { game?: string; scene?: string }) => Promise<Seat>;
  send: (s: Seat, msgs: unknown[]) => Promise<string>;
  /** The game's catalog matches for each query, best first. */
  find: (s: Seat, queries: AssetQuery[]) => Promise<PackAsset[][]>;
}

const keyOf = (q: { search: string; kind?: string }) => `${q.kind ?? ''}:${q.search}`;

/**
 * The catalog searches a build needs, asked once: each tile or model search
 * also as the other kind, for when a scene's preferred kind has none. None
 * when the game has no catalog at all.
 */
async function catalogOf(b: Bridge, s: Seat, queries: (AssetQuery & { search: string })[]) {
  if (!queries.length) return undefined;
  const other = (k?: string) => (k === 'tile' ? 'model' : 'tile');
  const all = queries.flatMap((q) => (q.kind === 'texture' ? [q] : [q, { ...q, kind: other(q.kind) } as typeof q]));
  const found = await b.find(s, all);
  if (found.every((list) => !list.length)) return undefined;
  const byKey = new Map(all.map((q, i) => [keyOf(q), found[i] ?? []]));
  const find: FindAssets = (q) => byKey.get(keyOf(q)) ?? [];
  return find;
}

function createScene(b: Bridge): McpTool {
  return {
    name: 'create_scene',
    description:
      'Makes a new, empty scene (GM). With width, height and ground it gets a ground tile that size, in the ' +
      'game’s catalog texture for that word when it has one (a Baileywiki pack: "grass", "forest", "cave"); ' +
      'then build on it with build_scene. Returns its id.',
    input: CreateSchema,
    run: async (a: Create) => {
      const s = await b.seat({ game: a.game });
      const ground = a.ground && !a.ground.startsWith('#') ? { search: a.ground, kind: 'texture' as const } : undefined;
      const find = ground && (await catalogOf(b, s, [ground]));
      const { id, ops } = createOps(s.welcome, a, find ? chooseAsset(find, ground.search, 'texture', 0) : undefined);
      await b.send(s, [{ t: 'ops', txn: `claude-scene-${id}`, label: 'new scene', ops }]);
      if (a.show) await b.send(s, [{ t: 'viewScene', scene: id }]);
      return JSON.stringify({ scene: id });
    },
  };
}

function buildScene(b: Bridge): McpTool {
  return {
    name: 'build_scene',
    description:
      'Builds on a scene (GM) in one undoable step: rooms (boxes walled once where they touch, with doors, ' +
      'windows, arches cut in, a floor and a light), wall paths, lights (presets torch, candle, campfire, lamp, ' +
      'lantern, magic, darkness), tiles (rect with texture/color, or image with src), creatures (monster SRD id ' +
      'or actor id, count), regions (x,y,w,h or points, with behaviors), sounds and notes. Units are squares ' +
      'by default: walls and boxes run on grid lines, points sit on the square centre. ' +
      'ALWAYS dress the map from the game’s asset catalog (a Baileywiki pack; search it with find_assets): ' +
      '`grounds` lay its tileable textures, `scatter` fills areas with its trees, rocks and clutter, `props` ' +
      'place one asset (a wagon, a well, a house) at its real size; room floors and tile textures take its ' +
      'texture for the word. On a 3D scene props and scatter are 3D models. Any other field is ' +
      'stored as given (see guide), e.g. hidden, trigger. Floors: give rooms and items `level` (or `levels` for ' +
      'several); stairs are a region with behaviors [{"type":"stairs","between":["ground","upper"]}], a lift ' +
      '[{"type":"elevator"}].',
    input: z.object({ ...ON, label: z.string().max(40).optional(), ...BlueprintSchema.shape }),
    run: async (a: z.infer<typeof BlueprintSchema> & { game?: string; scene?: string; label?: string }) => {
      const s = await b.seat(a);
      const taken = (coll: string, id: string) => !!sourceOf(s.welcome).get(coll, id);
      const bp = BlueprintSchema.parse(a);
      const prefer = sourceOf(s.welcome).get('scenes', s.scene)?.view === '3d' ? 'model' : 'tile';
      const assets = await catalogOf(b, s, assetQueries(bp, prefer));
      const rules = toEdition(s.welcome.world.rules);
      const ctx = { scene: s.scene, gridSize: gridOf(s), rules, taken, prefer, ...(assets && { assets }) } as const;
      const { ops, spawns } = blueprintBuild(bp, ctx);
      await b.send(s, [{ t: 'build', scene: s.scene, label: a.label ?? 'Claude build', ops, spawns }]);
      return summary(ops, spawns);
    },
  };
}

function describeScene(b: Bridge): McpTool {
  return {
    name: 'describe_scene',
    description:
      'A scene in full (GM): its settings and every item by collection (tiles, walls, lights, tokens, regions...), ' +
      'with ids to change through edit_documents ("<scene>/walls") or remove with clear_area.',
    input: z.object({ ...ON, only: z.array(z.enum(SCENE_COLLECTIONS as [string, ...string[]])).optional() }),
    run: async (a: { game?: string; scene?: string; only?: string[] }) => {
      const s = await b.seat(a);
      const items = itemsOf(s.welcome, s.scene);
      const shown = a.only ? Object.fromEntries(a.only.map((c) => [c, items[c] ?? []])) : items;
      return JSON.stringify({ scene: sceneDoc(s.welcome, s.scene), counts: counts(items), items: shown });
    },
  };
}

function renderScene(b: Bridge): McpTool {
  return {
    name: 'render_scene',
    description:
      'A top-down picture of a scene (or part of it) to check what was built: floors, walls, doors, windows, ' +
      'lights, regions and creatures, with a legend.',
    input: z.object({
      ...ON,
      size: z.number().int().min(64).max(2048).default(1024),
      area: z.object(AREA).optional().describe('Only this part (default: everything)'),
      level: z.string().optional().describe('Only this floor: its items, those on every floor, and creatures on it'),
    }),
    run: async (a: {
      game?: string;
      scene?: string;
      size: number;
      area?: Box & { units: string };
      level?: string;
    }): Promise<McpContent[]> => {
      const s = await b.seat(a);
      const scene = sceneDoc(s.welcome, s.scene);
      const area = a.area && toPixels(a.area, Number(scene.gridSize ?? 100));
      const { png, legend } = sceneSketch(
        {
          scene,
          items: floorItems(scene, itemsOf(s.welcome, s.scene), a.level),
          actors: sourceOf(s.welcome).all('actors'),
        },
        a.size,
        area,
      );
      return [
        { type: 'image', data: png.toString('base64'), mimeType: 'image/png' },
        { type: 'text', text: legend },
      ];
    },
  };
}

/** What stands on one floor: its items, those on every floor, and the creatures whose elevation is on it. */
function floorItems(scene: Doc, items: Record<string, Doc[]>, level?: string): Record<string, Doc[]> {
  if (!level) return items;
  const levels = (scene.levels ?? []) as SceneLevel[];
  if (!levels.some((l) => l.id === level)) {
    throw new Error(`No level "${level}" (levels: ${levels.map((l) => l.id).join(', ') || 'none'})`);
  }
  const on = (coll: string, d: Doc) =>
    coll === 'tokens' ? tokenLevel(levels, d as { elevation?: number }) === level : onLevel(d as OnLevels, level);
  return Object.fromEntries(Object.entries(items).map(([coll, docs]) => [coll, docs.filter((d) => on(coll, d))]));
}

function clearArea(b: Bridge): McpTool {
  return {
    name: 'clear_area',
    description:
      'Deletes the items lying wholly inside a box (GM), as one undoable step. By default everything but ' +
      'creatures and ground (background) tiles; name collections to choose.',
    input: z.object({ ...ON, ...AREA, only: z.array(z.enum(SCENE_COLLECTIONS as [string, ...string[]])).optional() }),
    run: async (a: Box & { game?: string; scene?: string; units: string; only?: string[] }) => {
      const s = await b.seat(a);
      const box = toPixels(a, Number(sceneDoc(s.welcome, s.scene).gridSize ?? 100));
      const colls = a.only ?? SCENE_COLLECTIONS.filter((c) => c !== 'tokens');
      const ops: Op[] = colls.flatMap((c) =>
        sourceOf(s.welcome)
          .all(`${s.scene}/${c}`)
          .filter((d) => inside(d, box) && (a.only !== undefined || d.background !== true))
          .map((d): Op => ({ op: 'delete', coll: `${s.scene}/${c}`, id: d.id })),
      );
      if (!ops.length) return 'Nothing there.';
      await b.send(s, [{ t: 'ops', txn: `claude-clear-${Date.now()}`, label: 'clear area', ops }]);
      const gone = counts(
        Object.fromEntries(colls.map((c) => [c, ops.filter((o) => o.coll.endsWith(`/${c}`)) as never[]])),
      );
      return `Cleared: ${Object.entries(gone)
        .map(([c, n]) => `${c} ${n}`)
        .join(', ')}.`;
    },
  };
}

function goToScene(b: Bridge): McpTool {
  return {
    name: 'go_to_scene',
    description: 'Takes your view to a scene (GM); with everyone, moves the whole game there.',
    input: z.object({ game: ON.game, scene: z.string(), everyone: z.boolean().default(false) }),
    run: async (a: { game?: string; scene: string; everyone: boolean }) => {
      const s = await b.seat({ game: a.game, scene: a.scene });
      sceneDoc(s.welcome, a.scene);
      return b.send(s, [{ t: a.everyone ? 'activateScene' : 'viewScene', scene: a.scene }]);
    },
  };
}

/** The scene's square size; the server refuses a scene that isn't there. */
function gridOf(s: Seat): number {
  const doc = sourceOf(s.welcome).get('scenes', s.scene);
  return Number(doc?.gridSize ?? s.welcome.world.gridSize);
}

function toPixels(a: Box & { units: string }, grid: number): Box {
  const k = a.units === 'squares' ? grid : 1;
  return { x: a.x * k, y: a.y * k, w: a.w * k, h: a.h * k };
}

export function sceneTools(table: BridgeTable): McpTool[] {
  const seat = async (a: { game?: string; scene?: string }): Promise<Seat> => {
    const { game, player } = await table.seat(a.game);
    const welcome = await look(game, player);
    return { game, player, welcome, scene: a.scene ?? welcome.scene };
  };
  const send = async (s: Seat, msgs: unknown[]) => outcome(await act(s.game, s.player, msgs as ClientMessage[]));
  const find = async (s: Seat, queries: AssetQuery[]) => {
    const answer = await ask(s.game, s.player, { t: 'findAssets', queries, limit: 60 }, 'assets');
    return answer.results.map((r) => r.assets);
  };
  const bridge = { seat, send, find };
  return [
    createScene(bridge),
    buildScene(bridge),
    describeScene(bridge),
    renderScene(bridge),
    clearArea(bridge),
    goToScene(bridge),
  ];
}
