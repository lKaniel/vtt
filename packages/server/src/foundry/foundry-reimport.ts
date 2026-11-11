import { cp, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { type Game, type KeptWork, uniqueId } from '@vtt/shared';
import { importFoundryWorld, type WorldImportOptions, type WorldReport } from './foundry-world.ts';
import { IMPORT_MANIFEST, type ImportManifest, readManifest } from './import-manifest.ts';
import { readJson, writeJson } from '../store/json-files.ts';

export { IMPORT_MANIFEST, readManifest } from './import-manifest.ts';

// Importing a Foundry world again into the game it made: the world is
// imported afresh beside the game, then everything the GM made in the VTT
// since is copied over (scenes Claude or the GM built, actors, folders,
// pictures, the players' explored fog), and the fresh folder takes the
// game's place. Foundry's own files win: what the last import made (its
// manifest, import-manifest.ts) is replaced, and dropped if Foundry no
// longer has it. A game imported before manifests counts every file the
// new import also makes as Foundry's. The game keeps its id, name, seats,
// packs, plugins and the scene everyone is on.

/** Every file under `dir`, by its path there with forward slashes. */
async function filesIn(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) =>
      join(e.parentPath, e.name)
        .slice(dir.length + 1)
        .replaceAll('\\', '/'),
    );
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

const sceneName = async (dir: string, id: string) =>
  (await readJson(join(dir, 'scenes', id, 'scene.json'))) as { name?: string } | undefined;

/** The game as it was, the fresh import beside it, and what the last import made. */
interface Sources {
  old: string;
  fresh: string;
  /** What the last import made, if it said. */
  before?: ImportManifest;
}

const madeBefore = (src: Sources, path: string) => src.before?.files.includes(path) ?? false;

/** Whether the old game's scene `id` was made in the VTT (and is not Foundry's). */
async function isOwnScene(src: Sources, id: string): Promise<boolean> {
  const path = `scenes/${id}/scene.json`;
  if (madeBefore(src, path)) return false;
  if (!(await exists(join(src.fresh, path)))) return true;
  if (src.before) return true;
  return (await sceneName(src.old, id))?.name !== (await sceneName(src.fresh, id))?.name;
}

/** The GM's own scenes, each with the id it gets (a new one if Foundry's scene took its id). */
async function ownScenes(src: Sources): Promise<Map<string, string>> {
  const ids = await readdir(join(src.old, 'scenes')).catch(() => [] as string[]);
  const taken = new Set([...ids, ...(await readdir(join(src.fresh, 'scenes')).catch(() => [] as string[]))]);
  const own = new Map<string, string>();
  for (const id of ids) {
    if (!(await isOwnScene(src, id))) continue;
    const clash = await exists(join(src.fresh, 'scenes', id));
    const to = clash ? uniqueId(id, (x) => taken.has(x)) : id;
    taken.add(to);
    own.set(id, to);
  }
  return own;
}

/** Where an old file goes in the fresh game (its scene may have moved). */
function movedPath(path: string, own: Map<string, string>): string {
  const [top, scene, ...rest] = path.split('/');
  const to = top === 'scenes' && scene ? own.get(scene) : undefined;
  return to ? ['scenes', to, ...rest].join('/') : path;
}

/** Copies the old game's files that Foundry's import did not make; how many. */
async function copyOwnFiles(src: Sources, own: Map<string, string>): Promise<number> {
  let copied = 0;
  for (const path of await filesIn(src.old)) {
    if (path === 'game.json' || path === IMPORT_MANIFEST || madeBefore(src, path)) continue;
    const to = movedPath(path, own);
    if (await exists(join(src.fresh, to))) continue;
    await cp(join(src.old, path), join(src.fresh, to));
    copied++;
  }
  return copied;
}

/** The fresh game.json with the old game's id, name, seats, options and scene. */
async function mergeGameFile(src: Sources, own: Map<string, string>): Promise<void> {
  const old = (await readJson(join(src.old, 'game.json'))) as Game;
  const fresh = (await readJson(join(src.fresh, 'game.json'))) as Game;
  const seated = new Set(old.players.map((p) => p.id));
  const scene = own.get(old.scene) ?? old.scene;
  await writeJson(join(src.fresh, 'game.json'), {
    ...fresh,
    id: old.id,
    name: old.name,
    players: [...old.players, ...fresh.players.filter((p) => !seated.has(p.id))],
    scene: (await exists(join(src.fresh, 'scenes', scene, 'scene.json'))) ? scene : fresh.scene,
    ...(old.settings && { settings: old.settings }),
    ...(old.packs && { packs: old.packs }),
    ...(old.plugins && { plugins: old.plugins }),
  });
}

/** Copies the GM's own work from the game in `old` into the freshly imported `fresh`. */
async function keepGameWork(old: string, fresh: string): Promise<KeptWork> {
  const src: Sources = { old, fresh, before: await readManifest(old) };
  const own = await ownScenes(src);
  const files = await copyOwnFiles(src, own);
  await mergeGameFile(src, own);
  const scenes = await Promise.all([...own.values()].map(async (id) => (await sceneName(fresh, id))?.name ?? id));
  return { scenes, files };
}

/** Swaps the folder `fresh` into the place of `game`. */
async function swap(game: string, fresh: string): Promise<void> {
  const old = `${game}.before-reimport`;
  await rm(old, { recursive: true, force: true });
  await rename(game, old);
  await rename(fresh, game);
  await rm(old, { recursive: true, force: true });
}

/**
 * Imports the Foundry world folder `from` again into the game folder `game`
 * that an import made, keeping what was made in the VTT since. The game is
 * left as it was if the import fails.
 */
export async function reimportFoundryWorld(from: string, game: string, opts: WorldImportOptions): Promise<WorldReport> {
  const fresh = `${game}.reimport`;
  await rm(fresh, { recursive: true, force: true });
  try {
    const report = await importFoundryWorld(from, fresh, opts);
    const kept = await keepGameWork(game, fresh);
    await swap(game, fresh);
    return { ...report, kept };
  } catch (e) {
    await rm(fresh, { recursive: true, force: true });
    throw e;
  }
}
