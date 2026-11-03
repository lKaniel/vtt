import { lossLine, placed } from './import-losses.ts';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { freeId, mediaKind, type PackManifest, packRef, slugify } from '@vtt/core';
import type { BaileywikiImportReport, BaileywikiScene, SceneEntry } from '@vtt/shared';
import { z } from 'zod';
import { type BaileywikiClient, baileywikiPath } from './baileywiki-client.ts';
import { foundryScene } from './foundry-scene.ts';
import { readJson, writeJson } from '../store/json-files.ts';

// Baileywiki's online scene compendia (the ones their Content Module
// loads from content.baileywiki.com) into the server's private
// "baileywiki" pack: each picked scene is fetched as Foundry data, the
// Baileywiki files it uses are downloaded into the pack's media/ (keeping
// their paths, so a file is fetched once for every scene that uses it),
// and the scene is converted like any Foundry scene. The pack sits in
// data/packs/, which is never committed: it is the admin's paid content.

const PACK = 'baileywiki';

/** The online compendia, as the Content Module's init.mjs names them. */
export const COMPENDIA = ['baileywiki-content.maps', 'baileywiki-content.maps-3d'] as const;

const MetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string().optional(),
  type: z.string(),
  packageName: z.string(),
  index: z.array(z.object({ _id: z.string(), name: z.string(), thumb: z.string().nullish() })),
});
type Meta = z.infer<typeof MetaSchema>;

const metaPath = (compendium: string) => `bw-content-releases/Compendium/${compendium}.json`;
const docPath = (m: Meta, id: string) =>
  `bw-content-releases/Compendium/${m.packageName}/${m.name}/${m.type}/${id}.json`;

/** Files that come from Baileywiki (the rest, core icons or other modules', aren't theirs to give). */
const isBaileywikiFile = (path: string) => /^(bw-content-releases\/|modules\/baileywiki-)/.test(path);
const safe = (path: string) => !path.split('/').some((part) => part === '..' || part === '');

/** Every Baileywiki media file a Foundry document names, as Baileywiki paths. */
export function baileywikiFiles(doc: unknown): string[] {
  const found = new Set<string>();
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      const path = baileywikiPath(value);
      if (mediaKind(path) && isBaileywikiFile(path) && safe(path)) found.add(path);
    } else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(doc);
  return [...found];
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

/** The Foundry uuid → our scene id of every scene the pack has from Baileywiki. */
const SourcesSchema = z.record(z.string(), z.string()).catch({});
const sourceKey = (compendium: string, id: string) => `${compendium}.${id}`;

async function readSources(dir: string): Promise<Record<string, string>> {
  return SourcesSchema.parse((await readJson(join(dir, 'sources.json'))) ?? {});
}

async function readMeta(client: BaileywikiClient, compendium: string): Promise<Meta | undefined> {
  try {
    return MetaSchema.parse(await client.json(metaPath(compendium)));
  } catch {
    return undefined;
  }
}

/** The scenes of the online compendia the account can read. */
export async function baileywikiScenes(client: BaileywikiClient, packsDir: string): Promise<BaileywikiScene[]> {
  const sources = await readSources(join(packsDir, PACK));
  const out: BaileywikiScene[] = [];
  for (const compendium of COMPENDIA) {
    const meta = await readMeta(client, compendium);
    if (!meta) continue;
    for (const entry of meta.index)
      out.push({
        compendium: meta.id,
        id: entry._id,
        name: entry.name,
        group: meta.label ?? meta.name,
        ...(entry.thumb ? { thumb: client.thumb(entry.thumb) } : {}),
        imported: sourceKey(meta.id, entry._id) in sources,
      });
  }
  return out;
}

export interface BaileywikiPick {
  compendium: string;
  id: string;
}

interface Run {
  client: BaileywikiClient;
  dir: string;
  have: Set<string>;
  downloaded: number;
  skipped: string[];
}

async function fetchFile(run: Run, path: string): Promise<void> {
  const to = join(run.dir, 'media', path);
  if (await exists(to)) {
    run.have.add(path);
    return;
  }
  try {
    const bytes = await run.client.bytes(path);
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, bytes);
    run.have.add(path);
    run.downloaded++;
  } catch (e) {
    run.skipped.push(`${path}: ${(e as Error).message}`);
  }
}

/** Downloads the files a few at a time. */
async function fetchFiles(run: Run, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 6) await Promise.all(paths.slice(i, i + 6).map((p) => fetchFile(run, p)));
}

/** One picked scene, converted, with its files downloaded. */
async function importOne(run: Run, meta: Meta, id: string): Promise<Omit<SceneEntry, 'id'> | undefined> {
  let doc: unknown;
  try {
    doc = await run.client.json(docPath(meta, id));
  } catch (e) {
    run.skipped.push(`scene ${id} in ${meta.label ?? meta.name}: ${(e as Error).message}`);
    return undefined;
  }
  await fetchFiles(run, baileywikiFiles(doc));
  const media = (path: string) => {
    const p = baileywikiPath(path);
    return run.have.has(p) ? packRef(PACK, `media/${p}`) : undefined;
  };
  const { scene, skipped } = foundryScene(doc, media);
  run.skipped.push(...placed(`scene "${scene.name}"`, skipped).map(lossLine));
  return scene;
}

interface PackState {
  scenes: SceneEntry[];
  sources: Record<string, string>;
}

async function readState(dir: string): Promise<PackState> {
  const scenes = await readJson(join(dir, 'compendia/scenes.json'));
  return { scenes: Array.isArray(scenes) ? (scenes as SceneEntry[]) : [], sources: await readSources(dir) };
}

/** Puts a scene in the list, in place of the one it came from before. */
function place(state: PackState, key: string, scene: Omit<SceneEntry, 'id'>): void {
  const taken = new Set(state.scenes.map((s) => s.id));
  const id = state.sources[key] ?? freeId(slugify(scene.name) || 'scene', (x) => taken.has(x), { bare: true });
  state.sources[key] = id;
  const at = state.scenes.findIndex((s) => s.id === id);
  if (at < 0) state.scenes.push({ id, ...scene });
  else state.scenes[at] = { id, ...scene };
}

async function writeState(dir: string, state: PackState): Promise<void> {
  await writeJson(join(dir, 'compendia/scenes.json'), state.scenes);
  await writeJson(join(dir, 'sources.json'), state.sources);
  const manifest: PackManifest = {
    id: PACK,
    name: 'Baileywiki',
    version: '1.0.0',
    system: null,
    compendia: [{ id: 'scenes', name: 'Scenes', type: 'scene', path: 'compendia/scenes.json' }],
    media: 'media/',
    source: 'baileywiki',
    author: 'Baileywiki',
    description: "Scenes downloaded with this server's Baileywiki sign-in. Private: never share or commit it.",
  };
  await writeJson(join(dir, 'pack.json'), manifest);
}

/** Imports the picked scenes into the Baileywiki pack in `packsDir`. */
export async function importBaileywiki(
  client: BaileywikiClient,
  packsDir: string,
  picks: readonly BaileywikiPick[],
): Promise<BaileywikiImportReport> {
  const dir = join(packsDir, PACK);
  const run: Run = { client, dir, have: new Set(), downloaded: 0, skipped: [] };
  const state = await readState(dir);
  const metas = new Map<string, Meta | undefined>();
  let scenes = 0;
  for (const pick of picks) {
    if (!metas.has(pick.compendium)) metas.set(pick.compendium, await readMeta(client, pick.compendium));
    const meta = metas.get(pick.compendium);
    const scene = meta && (await importOne(run, meta, pick.id));
    if (!meta) run.skipped.push(`compendium ${pick.compendium}: Baileywiki didn't give it`);
    if (!scene) continue;
    place(state, sourceKey(meta.id, pick.id), scene);
    scenes++;
  }
  await writeState(dir, state);
  return { pack: PACK, scenes, media: run.downloaded, skipped: run.skipped };
}
