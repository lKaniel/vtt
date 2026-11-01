import { copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { freeId, mediaKind, type PackManifest, packRef, slugify } from '@vtt/core';
import type { SceneEntry } from '@vtt/shared';
import { z } from 'zod';
import { foundryScene, type MediaLookup } from './foundry-scene.ts';
import { readJson, writeJson } from './json-files.ts';
import { filesUnder } from './pack-store.ts';

// Imports an unzipped Foundry VTT module, world or system folder as an
// asset pack: its pictures, sounds and videos are copied into the pack's
// media/ (folders kept, so they become tags), and the scenes of its
// old-style compendia (.db files, Foundry v10 and before), of a world's
// data/scenes.db and of "Export Data" files (fvtt-Scene-*.json) become a
// scene compendium. Foundry v11+ compendia are LevelDB databases, which
// can't be read yet. Run it with `pnpm import-foundry <folder>`.

const KINDS = ['module', 'world', 'system'] as const;
type Kind = (typeof KINDS)[number];

const FoundryPackSchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  path: z.string(),
  /** `type` since v10, `entity` before. */
  type: z.string().optional(),
  entity: z.string().optional(),
});
type FoundryPack = z.infer<typeof FoundryPackSchema>;

const FoundryManifestSchema = z.object({
  /** `id` since v10, `name` before. */
  id: z.string().optional(),
  name: z.string().optional(),
  title: z.string().optional(),
  version: z.union([z.string(), z.number()]).optional(),
  author: z.string().optional(),
  authors: z
    .array(z.object({ name: z.string() }).or(z.string()))
    .optional()
    .catch(undefined),
  description: z.string().optional(),
  packs: z.array(FoundryPackSchema).optional().catch(undefined),
});
type FoundryManifest = z.infer<typeof FoundryManifestSchema>;

export interface ImportOptions {
  /** The pack's id; the Foundry module's own by default. */
  id?: string;
  /** Replace a pack with that id that is already installed. */
  overwrite?: boolean;
}

export interface ImportReport {
  id: string;
  dir: string;
  media: number;
  scenes: number;
  /** What could not come along. */
  skipped: string[];
}

interface Source {
  dir: string;
  kind: Kind;
  foundryId: string;
  manifest: FoundryManifest;
}

async function readSource(dir: string): Promise<Source> {
  for (const kind of KINDS) {
    const raw = await readJson(join(dir, `${kind}.json`));
    if (raw === undefined) continue;
    const manifest = FoundryManifestSchema.parse(raw);
    const foundryId = manifest.id ?? manifest.name;
    if (!foundryId) throw new Error(`${kind}.json has no id`);
    return { dir, kind, foundryId, manifest };
  }
  throw new Error(
    `${dir} has no module.json, world.json or system.json: unzip a Foundry module, world or system first.`,
  );
}

const plainText = (html: string) =>
  html
    .replace(/<[^<>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

function authorOf(m: FoundryManifest): string | undefined {
  const names = (m.authors ?? []).map((a) => (typeof a === 'string' ? a : a.name));
  return names.length ? names.join(', ') : m.author;
}

/** Folders that hold code or databases, not media (and a world's data/ its documents). */
const skipped = (src: Source) => new Set(['packs', 'node_modules', '.git', ...(src.kind === 'world' ? ['data'] : [])]);

/** Copies every media file; returns the lookup from Foundry paths to pack refs. */
async function copyMedia(src: Source, packDir: string, id: string): Promise<{ count: number; lookup: MediaLookup }> {
  const skip = skipped(src);
  const files = (await filesUnder(src.dir)).filter((rel) => !skip.has(rel.split('/')[0]!) && mediaKind(rel));
  const refs = new Map<string, string>();
  for (const rel of files) {
    const to = join(packDir, 'media', rel);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(join(src.dir, rel), to);
    refs.set(`${src.kind}s/${src.foundryId}/${rel}`, packRef(id, `media/${rel}`));
  }
  return { count: files.length, lookup: (path) => refs.get(path.replace(/^\/+/, '')) };
}

/** The live documents of a NeDB file (one JSON per line; later lines replace earlier ones). */
async function readNedb(path: string): Promise<unknown[]> {
  const byId = new Map<string, Record<string, unknown>>();
  const text = await readFile(path, 'utf8');
  for (const line of text.split('\n')) {
    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const id = typeof doc._id === 'string' ? doc._id : String(byId.size);
    if (doc.$$deleted) byId.delete(id);
    else byId.set(id, doc);
  }
  return [...byId.values()];
}

const isDir = (path: string) =>
  stat(path).then(
    (s) => s.isDirectory(),
    () => false,
  );

/** The raw scenes of one Foundry compendium, or why it was left out. */
async function compendiumScenes(src: Source, pack: FoundryPack): Promise<{ scenes: unknown[]; skipped?: string }> {
  const type = pack.type ?? pack.entity ?? '?';
  if (type !== 'Scene')
    return { scenes: [], skipped: `compendium "${pack.name}" (${type}): only scenes are imported so far` };
  const path = join(src.dir, pack.path);
  if (path.endsWith('.db')) return { scenes: await readNedb(path).catch(() => []) };
  if (await isDir(path)) {
    const why =
      'a Foundry v11+ database, which cannot be read yet (export its scenes with "Export Data" and import again)';
    return { scenes: [], skipped: `compendium "${pack.name}": ${why}` };
  }
  return { scenes: await readNedb(`${path}.db`).catch(() => []) };
}

/** Every raw scene the folder has: in its compendia, a world's data/scenes.db, and scene exports. */
async function rawScenes(src: Source, skipped: string[]): Promise<unknown[]> {
  const out: unknown[] = [];
  for (const pack of src.manifest.packs ?? []) {
    const found = await compendiumScenes(src, pack);
    out.push(...found.scenes);
    if (found.skipped) skipped.push(found.skipped);
  }
  if (src.kind === 'world') out.push(...(await readNedb(join(src.dir, 'data', 'scenes.db')).catch(() => [])));
  const exports = (await filesUnder(src.dir)).filter((rel) => /(^|\/)fvtt-Scene-[^/]*\.json$/.test(rel));
  for (const rel of exports) out.push(await readJson(join(src.dir, rel)));
  return out.filter((s) => s && typeof s === 'object');
}

function convertScenes(raw: unknown[], lookup: MediaLookup, skipped: string[]): SceneEntry[] {
  const taken = new Set<string>();
  return raw.map((data) => {
    const { scene, skipped: lost } = foundryScene(data, lookup);
    const id = freeId(slugify(scene.name) || 'scene', (x) => taken.has(x), { bare: true });
    taken.add(id);
    skipped.push(...lost.map((what) => `scene "${scene.name}": ${what}`));
    return { id, ...scene };
  });
}

async function targetDir(packsDir: string, id: string, overwrite?: boolean): Promise<string> {
  const dir = join(packsDir, id);
  if (await isDir(dir)) {
    if (!overwrite) throw new Error(`A pack "${id}" is already installed (${dir}); pass --overwrite to replace it.`);
    await rm(dir, { recursive: true, force: true });
  }
  return dir;
}

/** Imports the Foundry folder `from` as a pack in `packsDir`. */
export async function importFoundry(from: string, packsDir: string, opts: ImportOptions = {}): Promise<ImportReport> {
  const src = await readSource(from);
  const id = slugify(opts.id ?? src.foundryId) || 'foundry-import';
  const dir = await targetDir(packsDir, id, opts.overwrite);
  const skipped: string[] = [];
  const media = await copyMedia(src, dir, id);
  const scenes = convertScenes(await rawScenes(src, skipped), media.lookup, skipped);
  const { manifest: m } = src;
  const manifest: PackManifest = {
    id,
    name: m.title ?? src.foundryId,
    version: m.version === undefined ? '1.0.0' : String(m.version),
    system: null,
    compendia: scenes.length ? [{ id: 'scenes', name: 'Scenes', type: 'scene', path: 'compendia/scenes.json' }] : [],
    media: 'media/',
    source: `foundry:${src.kind}`,
    ...(authorOf(m) ? { author: authorOf(m) } : {}),
    ...(m.description ? { description: plainText(m.description) } : {}),
  };
  if (scenes.length) await writeJson(join(dir, 'compendia', 'scenes.json'), scenes);
  await writeJson(join(dir, 'pack.json'), manifest);
  return { id, dir, media: media.count, scenes: scenes.length, skipped };
}
