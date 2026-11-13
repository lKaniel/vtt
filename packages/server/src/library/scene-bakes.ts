import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { bakeFileOk, bakeFolder } from '@vtt/shared';
import type { GameStore } from '../store/game-store.ts';
import { Refusal } from '../play/table.ts';

// The files of an optimised scene's bake (scene-bake.ts in shared): the GM's
// browser draws the picture pyramid and sends it block by block into the
// game's assets/baked/<scene>/<bake>/, the manifest last. Once a bake is
// whole, the scene's older ones go, except the one scene.json still names
// (the GM may not have switched to the new one yet, or undoes back to it).

export interface BakeFile {
  scene: string;
  bake: string;
  path: string;
  /** Base64. */
  data: string;
}

export async function saveBakeFile(store: GameStore, file: BakeFile): Promise<void> {
  const scene = store.docs.get('scenes', file.scene);
  if (!scene) throw new Refusal(`There is no scene "${file.scene}"`);
  if (!bakeFileOk(file.path)) throw new Refusal('That is no file of an optimised scene');
  const root = join(store.dir, 'assets', bakeFolder(file.scene, file.bake));
  const to = join(root, file.path);
  await mkdir(dirname(to), { recursive: true });
  await writeFile(to, Buffer.from(file.data, 'base64'));
  if (file.path === 'manifest.json') await pruneBakes(dirname(root), [file.bake, scene.bake]);
}

/** Removes the bakes in a scene's folder but those in `keep`. */
async function pruneBakes(sceneDir: string, keep: readonly unknown[]): Promise<void> {
  for (const bake of await readdir(sceneDir).catch(() => [])) {
    if (!keep.includes(bake)) await rm(join(sceneDir, bake), { recursive: true, force: true });
  }
}
