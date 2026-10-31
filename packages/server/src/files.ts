import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  ChunkSchema,
  chunkRect,
  parseChunkKey,
  TokenSchema,
  WorldSchema,
  type Chunk,
  type Token,
  type World,
} from '@vtt/shared';
import type { z } from 'zod';

// Reading and validating single world files. Shared by the server and the
// `check-world` command so both report the same problems.

export type WorldFile =
  | { kind: 'world'; data: World }
  | { kind: 'chunk'; key: string; data: Chunk }
  | { kind: 'token'; id: string; data: Token };

export type FileKind = { kind: 'world' } | { kind: 'chunk'; key: string } | { kind: 'token'; id: string };

/** Classifies a path relative to the world folder, or null for files we ignore. */
export function classify(rel: string): FileKind | null {
  const parts = rel.split(/[\\/]/);
  if (parts.length === 1 && parts[0] === 'world.json') return { kind: 'world' };
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
    case 'world': {
      const r = WorldSchema.safeParse(json);
      if (!r.success) return { errors: formatIssues(r.error) };
      const errors: string[] = [];
      if (r.data.chunkSize % r.data.gridSize !== 0) errors.push('chunkSize must be a multiple of gridSize');
      const ids = new Set<string>();
      for (const p of r.data.players) {
        if (ids.has(p.id)) errors.push(`duplicate player id "${p.id}"`);
        ids.add(p.id);
      }
      if (!r.data.players.some((p) => p.role === 'gm')) errors.push('at least one player needs role "gm"');
      return errors.length ? { errors } : { file: { kind: 'world', data: r.data }, errors };
    }
    case 'chunk': {
      if (!parseChunkKey(kind.key)) return { errors: ['chunk files are named <cx>_<cy>.json, e.g. 0_-1.json'] };
      const r = ChunkSchema.safeParse(json);
      if (!r.success) return { errors: formatIssues(r.error) };
      const errors: string[] = [];
      const ids = new Set<string>();
      for (const item of [...r.data.tiles, ...r.data.walls]) {
        if (ids.has(item.id)) errors.push(`duplicate id "${item.id}" in this chunk`);
        ids.add(item.id);
      }
      return errors.length ? { errors } : { file: { kind: 'chunk', key: kind.key, data: r.data }, errors };
    }
    case 'token': {
      const r = TokenSchema.safeParse(json);
      if (!r.success) return { errors: formatIssues(r.error) };
      if (r.data.id !== kind.id) return { errors: [`id "${r.data.id}" must match the file name "${kind.id}"`] };
      return { file: { kind: 'token', id: kind.id, data: r.data }, errors: [] };
    }
  }
}

export async function readWorldFile(path: string, kind: FileKind): Promise<ParseResult> {
  return parseFile(kind, await readFile(path, 'utf8'));
}

/** Problems that need the whole world, e.g. a token controlled by an unknown player. */
export interface Issue {
  file: string;
  message: string;
  warning?: boolean;
}

export function crossCheck(world: World, chunks: Map<string, Chunk>, tokens: Map<string, Token>): Issue[] {
  const out: Issue[] = [];
  const players = new Set(world.players.map((p) => p.id));
  for (const t of tokens.values()) {
    for (const c of [...t.controllers, ...(t.visibleTo ?? [])]) {
      if (!players.has(c)) out.push({ file: `tokens/${t.id}.json`, message: `unknown player "${c}"` });
    }
  }
  for (const [key, chunk] of chunks) {
    const r = chunkRect(key, world.chunkSize)!;
    const inside = (x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    for (const w of chunk.walls) {
      const mx = (w.a[0] + w.b[0]) / 2;
      const my = (w.a[1] + w.b[1]) / 2;
      if (!inside(mx, my)) out.push({ file: `chunks/${key}.json`, message: `wall "${w.id}" has its midpoint outside this chunk`, warning: true });
    }
    for (const t of chunk.tiles) {
      if (!inside(t.x, t.y)) out.push({ file: `chunks/${key}.json`, message: `tile "${t.id}" starts outside this chunk`, warning: true });
    }
  }
  return out;
}
