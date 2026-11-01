import { defaultEdition, type PackCompendium } from '@vtt/core';
import { basename } from 'node:path';
import {
  type Actor,
  ActorSchema,
  type Combat,
  CombatSchema,
  type Dnd5eSystem,
  resolveToken,
  type TokenEntry,
  TokenEntrySchema,
} from '@vtt/system-dnd5e';
import {
  type Game,
  GameSchema,
  type PlacedLight,
  PlacedLightSchema,
  type Scene,
  SceneSchema,
  type Tile,
  TileSchema,
  tileTreeIssues,
  type Wall,
  WallSchema,
  type World,
  worldOf,
} from '@vtt/shared';
import type { z } from 'zod';
import { toDoc } from './doc-sync.ts';
import { SYSTEMS } from './systems.ts';
import { contentCompendia, gamePackIssues } from './game-packs.ts';
import type { PackStore } from './pack-store.ts';

// Reading and validating single game files (storage v2). Shared by the
// server and the `check-game` command so both report the same problems.
//
//   game.json                     the game and its seats
//   actors/<id>.json              creatures' sheets: the GM's Actors list
//   combat.json                   the fight in progress
//   scenes/<id>/scene.json        a scene's grid, lighting and camera start
//   scenes/<id>/<coll>.json       a list per collection: tiles, walls, lights, tokens

const SCENE_COLLECTIONS = ['tiles', 'walls', 'lights', 'tokens'] as const;
export type SceneCollection = (typeof SCENE_COLLECTIONS)[number];

export interface SceneItems {
  tiles: Tile[];
  walls: Wall[];
  lights: PlacedLight[];
  tokens: TokenEntry[];
}

export const ITEM_SCHEMAS = {
  tiles: TileSchema,
  walls: WallSchema,
  lights: PlacedLightSchema,
  tokens: TokenEntrySchema,
};
const NOUN: Record<SceneCollection, string> = { tiles: 'tile', walls: 'wall', lights: 'light', tokens: 'token' };

export type FileKind =
  | { kind: 'game' }
  | { kind: 'combat' }
  | { kind: 'actor'; id: string }
  | { kind: 'scene'; scene: string }
  | { kind: 'collection'; scene: string; coll: SceneCollection };

export type GameFile =
  | { kind: 'game'; data: Game }
  | { kind: 'combat'; data: Combat }
  | { kind: 'actor'; id: string; data: Actor }
  | { kind: 'scene'; scene: string; data: Scene }
  | { kind: 'collection'; scene: string; coll: SceneCollection; data: SceneItems[SceneCollection] };

const isCollection = (name: string): name is SceneCollection => (SCENE_COLLECTIONS as readonly string[]).includes(name);

function classifyScene(scene: string, file: string): FileKind | null {
  if (file === 'scene.json') return { kind: 'scene', scene };
  const name = basename(file, '.json');
  return file.endsWith('.json') && isCollection(name) ? { kind: 'collection', scene, coll: name } : null;
}

/** Classifies a path relative to the game folder, or null for files we ignore. */
export function classify(rel: string): FileKind | null {
  const parts = rel.split(/[\\/]/);
  if (parts.length === 1 && parts[0] === 'game.json') return { kind: 'game' };
  if (parts.length === 1 && parts[0] === 'combat.json') return { kind: 'combat' };
  if (parts.length === 2 && parts[0] === 'actors' && parts[1]!.endsWith('.json')) {
    return { kind: 'actor', id: basename(parts[1]!, '.json') };
  }
  if (parts.length === 3 && parts[0] === 'scenes') return classifyScene(parts[1]!, parts[2]!);
  return null;
}

/** The path of a file, the other way round. */
export function pathOf(kind: FileKind): string {
  switch (kind.kind) {
    case 'game':
    case 'combat':
      return `${kind.kind}.json`;
    case 'actor':
      return `actors/${kind.id}.json`;
    case 'scene':
      return `scenes/${kind.scene}/scene.json`;
    case 'collection':
      return `scenes/${kind.scene}/${kind.coll}.json`;
  }
}

function formatIssues(error: z.ZodError, prefix = ''): string[] {
  return error.issues.map((i) => prefix + (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message));
}

export interface ParseResult {
  file?: GameFile;
  errors: string[];
}

export function parseFile(kind: FileKind, text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { errors: [`invalid JSON: ${(e as Error).message}`] };
  }
  switch (kind.kind) {
    case 'game':
      return parseGame(json);
    case 'scene':
      return parseScene(kind.scene, json);
    case 'collection':
      return parseCollection(kind.scene, kind.coll, json);
    case 'actor':
      return parseActor(kind.id, json);
    case 'combat':
      return parseCombat(json);
  }
}

function result(file: GameFile, errors: string[]): ParseResult {
  return errors.length ? { errors } : { file, errors };
}

function duplicateIds(ids: string[], where: string): string[] {
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) errors.push(`duplicate id "${id}" ${where}`);
    seen.add(id);
  }
  return errors;
}

function parseGame(json: unknown): ParseResult {
  const r = GameSchema.safeParse(json);
  if (!r.success) return { errors: formatIssues(r.error) };
  const errors = duplicateIds(
    r.data.players.map((p) => p.id),
    'among players',
  );
  if (!r.data.players.some((p) => p.role === 'gm')) errors.push('at least one player needs role "gm"');
  return result({ kind: 'game', data: r.data }, errors);
}

function parseScene(scene: string, json: unknown): ParseResult {
  const r = SceneSchema.safeParse(json);
  if (!r.success) return { errors: formatIssues(r.error) };
  const errors = r.data.chunkSize % r.data.gridSize === 0 ? [] : ['chunkSize must be a multiple of gridSize'];
  return result({ kind: 'scene', scene, data: r.data }, errors);
}

/** What to call an item in a message: its id if it has one, else its place in the list. */
function itemName(coll: SceneCollection, raw: unknown, index: number): string {
  const id = (raw as { id?: unknown } | null)?.id;
  return typeof id === 'string' ? `${NOUN[coll]} "${id}"` : `${NOUN[coll]} #${index + 1}`;
}

function parseCollection(scene: string, coll: SceneCollection, json: unknown): ParseResult {
  if (!Array.isArray(json)) return { errors: [`${coll}.json must be a list of ${coll}`] };
  const schema: z.ZodType<SceneItems[SceneCollection][number]> = ITEM_SCHEMAS[coll];
  const items: SceneItems[SceneCollection][number][] = [];
  const errors: string[] = [];
  json.forEach((raw: unknown, i) => {
    const r = schema.safeParse(raw);
    if (r.success) items.push(r.data);
    else errors.push(...formatIssues(r.error, `${itemName(coll, raw, i)}: `));
  });
  errors.push(
    ...duplicateIds(
      items.map((item) => item.id),
      'in this scene',
    ),
  );
  return result({ kind: 'collection', scene, coll, data: items as SceneItems[SceneCollection] }, errors);
}

function parseActor(id: string, json: unknown): ParseResult {
  const r = ActorSchema.safeParse(json);
  if (!r.success) return { errors: formatIssues(r.error) };
  if (r.data.id !== id) return { errors: [`id "${r.data.id}" must match the file name "${id}"`] };
  return { file: { kind: 'actor', id, data: r.data }, errors: [] };
}

function parseCombat(json: unknown): ParseResult {
  const r = CombatSchema.safeParse(json);
  if (!r.success) return { errors: formatIssues(r.error) };
  return { file: { kind: 'combat', data: r.data }, errors: [] };
}

/** A whole game, as loaded from its folder. */
export interface GameState {
  game: Game;
  scenes: Map<string, { scene: Scene } & SceneItems>;
  actors: ReadonlyMap<string, Actor>;
  combat?: Combat;
}

export interface Issue {
  file: string;
  message: string;
  warning?: boolean;
}

/** What token references are checked against: the seats and the game's system. */
interface Refs {
  players: Set<string>;
  world: World;
  system: Dnd5eSystem | undefined;
  /** The rules content of the game's packs. */
  content: readonly PackCompendium[];
}

/**
 * Problems that need the whole game, e.g. a token controlled by an unknown
 * player. `system` checks what tokens refer to (monsters, spells); by
 * default the one game.json names.
 */
export function crossCheck(state: GameState, system = SYSTEMS.get(state.game.system), packs?: PackStore): Issue[] {
  const { game, scenes, actors, combat } = state;
  const out: Issue[] = [];
  if (!system) out.push({ file: 'game.json', message: `this server has no "${game.system}" system` });
  const content = system ? contentCompendia(packs, game, system) : [];
  for (const message of system ? gamePackIssues(packs, game, system) : [])
    out.push({ file: 'game.json', message, warning: true });
  const active = scenes.get(game.scene);
  if (!active) out.push({ file: 'game.json', message: `scene "${game.scene}" has no folder in scenes/` });
  const players = new Set(game.players.map((p) => p.id));
  for (const [id, s] of scenes) {
    const refs = { players, world: worldOf(game, s.scene), system, content };
    out.push(...sceneTokenIssues(id, s, state, refs), ...sceneTileIssues(id, s.tiles));
  }
  const refs = { players, world: worldOf(game, active?.scene ?? SceneSchema.parse({})), system, content };
  for (const a of actors.values()) {
    out.push(...tokenIssues(a, refs).map((message) => ({ file: `actors/${a.id}.json`, message })));
  }
  return [...out, ...combatIssues(combat, active?.tokens ?? [])];
}

/** Initiative entries for tokens that aren't on the game's scene. */
function combatIssues(combat: Combat | undefined, tokens: readonly TokenEntry[]): Issue[] {
  const onScene = new Set(tokens.map((t) => t.id));
  return (combat?.order ?? [])
    .filter((e) => !onScene.has(e.token))
    .map((e) => ({ file: 'combat.json', message: `unknown token "${e.token}" in the initiative order` }));
}

/** Problems with how the tiles of one scene nest. */
function sceneTileIssues(id: string, tiles: readonly Tile[]): Issue[] {
  const docs = tiles.map((t) => toDoc('tile', t));
  return tileTreeIssues(docs).map((issue) => ({ file: `scenes/${id}/tiles.json`, ...issue }));
}

/** Problems with the tokens of one scene. */
function sceneTokenIssues(id: string, s: SceneItems, state: GameState, refs: Refs): Issue[] {
  return s.tokens.flatMap((t) =>
    entryIssues(t, t.actor ? state.actors.get(t.actor) : undefined, refs).map((m) => ({
      file: `scenes/${id}/tokens.json`,
      message: `token "${t.id}": ${m}`,
    })),
  );
}

/** What is wrong with a stored token, leaving out what its actor's own file is reported for. */
function entryIssues(entry: TokenEntry, actor: Actor | undefined, refs: Refs): string[] {
  const { token, errors } = resolveToken(entry, actor);
  if (!token) return errors;
  const inherited = new Set(actor ? tokenIssues(actor, refs) : []);
  return tokenIssues(token, refs).filter((m) => !inherited.has(m));
}

/** References from a token or actor to players and to content its system doesn't have. */
function tokenIssues(t: Actor, { players, world, system, content }: Refs): string[] {
  return [
    ...[...Object.keys(t.ownership ?? {}).filter((k) => k !== 'default'), ...(t.visibleTo ?? [])]
      .filter((c) => !players.has(c))
      .map((c) => `unknown player "${c}"`),
    ...(system?.tokenIssues(t, world.rules ?? defaultEdition(system), content) ?? []),
  ];
}
