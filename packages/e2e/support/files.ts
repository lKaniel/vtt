// Editing the copied game's files, the way a GM (or Claude) prepares an
// encounter by hand: docs/game-format.md.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type Entry = { id: string } & Record<string, unknown>;

/** Changes the entries of one of a scene's lists (`tokens`, `walls` …) in place. */
async function editSceneList(
  gameDir: string,
  list: string,
  edit: (entries: Entry[]) => Entry[],
  scene = 'crossroads',
): Promise<void> {
  const file = join(gameDir, 'scenes', scene, `${list}.json`);
  const entries = JSON.parse(await readFile(file, 'utf8')) as Entry[];
  await writeFile(file, JSON.stringify(edit(entries), null, 2));
}

/** Puts token `id` at world point (x, y). */
export function placeToken(gameDir: string, id: string, x: number, y: number): Promise<void> {
  return editSceneList(gameDir, 'tokens', (tokens) => tokens.map((t) => (t.id === id ? { ...t, x, y } : t)));
}

/** Changes actor `id`'s file (`actors/<id>.json`). */
export async function editActor(
  gameDir: string,
  id: string,
  edit: (actor: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const file = join(gameDir, 'actors', `${id}.json`);
  const actor = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  await writeFile(file, JSON.stringify(edit(actor), null, 2));
}

/** Merges `patch` into wall `id` of the crossroads (a door's name and description). */
export function editWall(gameDir: string, id: string, patch: Record<string, unknown>): Promise<void> {
  return editSceneList(gameDir, 'walls', (walls) => walls.map((w) => (w.id === id ? { ...w, ...patch } : w)));
}
