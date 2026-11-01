import { readdir, readFile } from 'node:fs/promises';
import type { Actor } from '@vtt/shared';
import { join } from 'node:path';
import {
  classify,
  crossCheck,
  parseFile,
  type FileKind,
  type GameFile,
  type GameState,
  type Issue,
} from './game-files.ts';

// Reading a whole game folder: every file the game knows, parsed. The
// server loads from this and `check-game` reports from it.

export interface FolderEntry {
  rel: string;
  kind: FileKind;
  text: string;
  file?: GameFile;
  errors: string[];
}

async function names(dir: string, sub: string): Promise<string[]> {
  return readdir(join(dir, sub)).catch(() => [] as string[]);
}

/** Paths of the files a game folder holds, game.json first. Unknown files are listed separately. */
async function gameFiles(dir: string): Promise<{ known: string[]; unknown: string[] }> {
  const top = await names(dir, '.');
  const all = [...top.filter((n) => n.endsWith('.json')), ...(await names(dir, 'actors')).map((n) => `actors/${n}`)];
  for (const scene of await names(dir, 'scenes')) {
    all.push(...(await names(dir, `scenes/${scene}`)).map((n) => `scenes/${scene}/${n}`));
  }
  const known = all
    .filter((rel) => classify(rel))
    .sort((a, b) => Number(b === 'game.json') - Number(a === 'game.json'));
  return { known, unknown: all.filter((rel) => !classify(rel)) };
}

export async function readEntry(dir: string, rel: string): Promise<FolderEntry | undefined> {
  const kind = classify(rel);
  if (!kind) return undefined;
  const text = await readFile(join(dir, rel), 'utf8').catch(() => undefined);
  if (text === undefined) return undefined;
  return { rel, kind, text, ...parseFile(kind, text) };
}

export async function readFolder(dir: string): Promise<FolderEntry[]> {
  const out: FolderEntry[] = [];
  for (const rel of (await gameFiles(dir)).known) {
    const entry = await readEntry(dir, rel);
    if (entry) out.push(entry);
  }
  return out;
}

const emptyScene = () => ({ tiles: [], walls: [], lights: [], tokens: [] });

function addFile(state: GameState & { actors: Map<string, Actor> }, file: GameFile): void {
  if (file.kind === 'scene') state.scenes.set(file.scene, { ...emptyScene(), scene: file.data });
  else if (file.kind === 'actor') state.actors.set(file.id, file.data);
  else if (file.kind === 'combat') state.combat = file.data;
}

function addItems(state: GameState, file: GameFile): void {
  const scene = file.kind === 'collection' ? state.scenes.get(file.scene) : undefined;
  if (scene && file.kind === 'collection') scene[file.coll] = file.data as never;
}

/** The game the valid files describe, or undefined without a valid game.json. */
export function stateOf(entries: readonly FolderEntry[]): GameState | undefined {
  const files = entries.flatMap((e) => (e.file ? [e.file] : []));
  const game = files.find((f) => f.kind === 'game');
  if (game?.kind !== 'game') return undefined;
  const state = { game: game.data, scenes: new Map(), actors: new Map<string, Actor>() };
  for (const file of files) addFile(state, file);
  for (const file of files) addItems(state, file);
  return state;
}

/** Collection files of a scene folder whose scene.json is missing or broken. */
function orphans(entries: readonly FolderEntry[], state: GameState): Issue[] {
  return entries
    .filter((e) => e.kind.kind === 'collection' && !state.scenes.has(e.kind.scene))
    .map((e) => ({ file: e.rel, message: 'its scene has no valid scene.json, so it is not loaded' }));
}

/** Every problem in a game folder: file errors first, then the ones that need the whole game. */
export async function checkFolder(dir: string): Promise<{ issues: Issue[]; state?: GameState }> {
  const top = await names(dir, '.');
  const issues: Issue[] = [];
  for (const old of ['world.json', 'chunks', 'tokens'].filter((n) => top.includes(n))) {
    issues.push({ file: old, message: 'left from the old world layout: start the server or run pnpm migrate-world' });
  }
  if (!top.includes('game.json')) issues.push({ file: 'game.json', message: 'missing' });
  const { unknown } = await gameFiles(dir);
  for (const rel of unknown) issues.push({ file: rel, message: 'not a game file, ignored', warning: true });
  const entries = await readFolder(dir);
  for (const e of entries) for (const message of e.errors) issues.push({ file: e.rel, message });
  const state = stateOf(entries);
  if (state) issues.push(...crossCheck(state), ...orphans(entries, state));
  return { issues, state };
}
