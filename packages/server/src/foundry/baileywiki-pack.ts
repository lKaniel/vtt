import { join } from 'node:path';
import { type CompendiumInfo, type PackManifest, PackManifestSchema } from '@vtt/core';
import { readJson, writeJson } from '../store/json-files.ts';

// The `baileywiki` pack's manifest. Two imports fill the pack: scenes
// downloaded with a Baileywiki sign-in (baileywiki-import.ts) and the
// modules installed in Foundry (baileywiki-modules.ts). Each writes its own
// compendia and keeps the other's.

const BASE: PackManifest = {
  id: 'baileywiki',
  name: 'Baileywiki',
  version: '1.0.0',
  system: null,
  compendia: [],
  media: 'media/',
  source: 'baileywiki',
  author: 'Baileywiki',
  license: 'private',
  description: 'Baileywiki maps, tiles, 3D models, scenes and prefabs. Paid content: never share or commit it.',
};

/** Writes the pack's pack.json with `compendia` in place of those of the same ids, the rest kept. */
export async function mergeBaileywikiManifest(
  dir: string,
  compendia: CompendiumInfo[],
  extra: Partial<Pick<PackManifest, 'mediaIndex'>> = {},
): Promise<PackManifest> {
  const old = PackManifestSchema.safeParse(await readJson(join(dir, 'pack.json'))).data;
  const ids = new Set(compendia.map((c) => c.id));
  const kept = (old?.compendia ?? []).filter((c) => !ids.has(c.id));
  const manifest: PackManifest = {
    ...BASE,
    ...(old?.mediaIndex ? { mediaIndex: old.mediaIndex } : {}),
    ...extra,
    compendia: [...kept, ...compendia],
  };
  await writeJson(join(dir, 'pack.json'), manifest);
  return manifest;
}
