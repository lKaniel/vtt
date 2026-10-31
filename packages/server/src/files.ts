import { basename } from 'node:path';
import {
  ChunkSchema,
  CombatSchema,
  editionOf,
  chunkRect,
  parseChunkKey,
  srdFor,
  TokenSchema,
  WorldSchema,
  type Chunk,
  type Combat,
  type Token,
  type World,
} from '@vtt/shared';
import type { z } from 'zod';

// Reading and validating single world files. Shared by the server and the
// `check-world` command so both report the same problems.

export type WorldFile =
  | { kind: 'world'; data: World }
  | { kind: 'chunk'; key: string; data: Chunk }
  | { kind: 'token'; id: string; data: Token }
  | { kind: 'combat'; data: Combat };

export type FileKind =
  { kind: 'world' } | { kind: 'combat' } | { kind: 'chunk'; key: string } | { kind: 'token'; id: string };

/** Classifies a path relative to the world folder, or null for files we ignore. */
export function classify(rel: string): FileKind | null {
  const parts = rel.split(/[\\/]/);
  if (parts.length === 1 && parts[0] === 'world.json') return { kind: 'world' };
  if (parts.length === 1 && parts[0] === 'combat.json') return { kind: 'combat' };
  if (parts.length !== 2 || !parts[1]!.endsWith('.json')) return null;
  const name = basename(parts[1]!, '.json');
  if (parts[0] === 'chunks') return { kind: 'chunk', key: name };
  if (parts[0] === 'tokens') return { kind: 'token', id: name };
  return null;
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message));
}

export interface ParseResult {
  file?: WorldFile;
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
    case 'world':
      return parseWorld(json);
    case 'chunk':
      return parseChunk(kind.key, json);
    case 'token':
      return parseToken(kind.id, json);
    case 'combat':
      return parseCombat(json);
  }
}

function result(file: WorldFile, errors: string[]): ParseResult {
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

function parseWorld(json: unknown): ParseResult {
  const r = WorldSchema.safeParse(json);
  if (!r.success) return { errors: formatIssues(r.error) };
  const errors = duplicateIds(
    r.data.players.map((p) => p.id),
    'among players',
  );
  if (r.data.chunkSize % r.data.gridSize !== 0) errors.push('chunkSize must be a multiple of gridSize');
  if (!r.data.players.some((p) => p.role === 'gm')) errors.push('at least one player needs role "gm"');
  return result({ kind: 'world', data: r.data }, errors);
}

function parseChunk(key: string, json: unknown): ParseResult {
  if (!parseChunkKey(key)) return { errors: ['chunk files are named <cx>_<cy>.json, e.g. 0_-1.json'] };
  const r = ChunkSchema.safeParse(json);
  if (!r.success) return { errors: formatIssues(r.error) };
  const ids = [...r.data.tiles, ...r.data.walls, ...r.data.lights].map((item) => item.id);
  return result({ kind: 'chunk', key, data: r.data }, duplicateIds(ids, 'in this chunk'));
}

function parseToken(id: string, json: unknown): ParseResult {
  const r = TokenSchema.safeParse(json);
  if (!r.success) return { errors: formatIssues(r.error) };
  if (r.data.id !== id) return { errors: [`id "${r.data.id}" must match the file name "${id}"`] };
  return { file: { kind: 'token', id, data: r.data }, errors: [] };
}

function parseCombat(json: unknown): ParseResult {
  const r = CombatSchema.safeParse(json);
  if (!r.success) return { errors: formatIssues(r.error) };
  return { file: { kind: 'combat', data: r.data }, errors: [] };
}

export interface Issue {
  file: string;
  message: string;
  warning?: boolean;
}

/** Problems that need the whole world, e.g. a token controlled by an unknown player. */
export function crossCheck(
  world: World,
  chunks: Map<string, Chunk>,
  tokens: Map<string, Token>,
  combat?: Combat,
): Issue[] {
  const players = new Set(world.players.map((p) => p.id));
  const out: Issue[] = [];
  for (const t of tokens.values()) out.push(...tokenIssues(t, players, world));
  for (const [key, chunk] of chunks) out.push(...misplacedItems(key, chunk, world.chunkSize));
  for (const e of combat?.order ?? []) {
    if (!tokens.has(e.token)) {
      out.push({ file: 'combat.json', message: `unknown token "${e.token}" in the initiative order` });
    }
  }
  return out;
}

/** References from a token to players and SRD content that don't exist. */
function tokenIssues(t: Token, players: Set<string>, world: World): Issue[] {
  const edition = editionOf(t, world);
  const srd = srdFor(edition);
  const messages = [
    ...[...t.controllers, ...(t.visibleTo ?? [])].filter((c) => !players.has(c)).map((c) => `unknown player "${c}"`),
    ...(t.monster && !srd.monsters.has(t.monster) ? [`unknown monster "${t.monster}" in the ${edition} rules`] : []),
    ...(t.inventory ?? []).filter((e) => !srd.items.has(e.item)).map((e) => `unknown item "${e.item}"`),
  ];
  return messages.map((message) => ({ file: `tokens/${t.id}.json`, message }));
}

/** Items whose anchor point lies outside the chunk file they're stored in. */
function misplacedItems(key: string, chunk: Chunk, chunkSize: number): Issue[] {
  const r = chunkRect(key, chunkSize)!;
  const anchors = [
    ...chunk.walls.map((w) => ({
      what: `wall "${w.id}" midpoint`,
      x: (w.a[0] + w.b[0]) / 2,
      y: (w.a[1] + w.b[1]) / 2,
    })),
    ...chunk.lights.map((l) => ({ what: `light "${l.id}"`, x: l.x, y: l.y })),
    ...chunk.tiles.map((t) => ({ what: `tile "${t.id}" top-left corner`, x: t.x, y: t.y })),
  ];
  return anchors
    .filter(({ x, y }) => x < r.x || x >= r.x + r.w || y < r.y || y >= r.y + r.h)
    .map(({ what }) => ({ file: `chunks/${key}.json`, message: `${what} is outside this chunk`, warning: true }));
}
