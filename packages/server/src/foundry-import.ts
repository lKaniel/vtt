import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { freeId, mediaKind, type PackManifest, packRef, slugify } from '@vtt/core';
import type { SceneEntry } from '@vtt/shared';
import { z } from 'zod';
import { type FoundryDoc, readFoundryDb } from './foundry-db.ts';
import { foundryEntries } from './foundry-entries.ts';
import { foundryScene, type MediaLookup, type SceneLookups } from './foundry-scene.ts';
import { readJson, writeJson } from './json-files.ts';
import { filesUnder } from './pack-store.ts';

// Imports an unzipped Foundry VTT module, world or system folder as an
// asset pack: its pictures, sounds and videos are copied into the pack's
// media/ (folders kept, so they become tags), and the scenes of its
// compendia (NeDB files up to v10, LevelDB folders from v11, adventures
// included), of a world's data/ and of "Export Data" files
// (fvtt-Scene-*.json) become a scene compendium; journal entries, roll
// tables and playlists become compendia of their own (map notes keep
// pointing at their entries). Run it with `pnpm import-foundry <folder>`.
// A whole world as a game to play is foundry-world.ts.

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
  /** Journal entries, roll tables and playlists. */
  documents: number;
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

const isDir = (path: string) =>
  stat(path).then(
    (s) => s.isDirectory(),
    () => false,
  );

/** Foundry document types we bring along, by the kind of raw list they go in. */
const TYPES: Record<string, keyof RawDocs> = {
  Scene: 'scenes',
  JournalEntry: 'journals',
  RollTable: 'tables',
  Playlist: 'playlists',
};

/** A world's data/ files, by the raw list they go in. */
const WORLD_FILES: Record<keyof RawDocs, string> = {
  scenes: 'scenes',
  journals: 'journal',
  tables: 'tables',
  playlists: 'playlists',
};

interface RawDocs {
  scenes: unknown[];
  journals: unknown[];
  tables: unknown[];
  playlists: unknown[];
}

/** What an Adventure (a module's ready-to-play campaign) holds, by the raw list it goes in. */
const ADVENTURE_FIELDS: Record<keyof RawDocs, string> = {
  scenes: 'scenes',
  journals: 'journal',
  tables: 'tables',
  playlists: 'playlists',
};

/** The scenes, journal entries, tables and playlists inside adventures. */
function adventureDocs(adventures: FoundryDoc[], out: RawDocs): void {
  for (const adventure of adventures)
    for (const [into, field] of Object.entries(ADVENTURE_FIELDS) as [keyof RawDocs, string][]) {
      const docs = adventure[field];
      if (Array.isArray(docs)) out[into].push(...(docs as unknown[]));
    }
}

const ONLY = 'only scenes, journal entries, roll tables and playlists are imported so far';

/** The documents of the module's compendia we bring along (adventures opened up). */
async function compendiumDocs(src: Source, out: RawDocs, skipped: string[]): Promise<void> {
  for (const pack of src.manifest.packs ?? []) {
    const type = pack.type ?? pack.entity ?? '?';
    const into = TYPES[type];
    if (!into && type !== 'Adventure') {
      skipped.push(`compendium "${pack.name}" (${type}): ${ONLY}`);
      continue;
    }
    const docs = await readFoundryDb(join(src.dir, pack.path));
    if (into) out[into].push(...docs);
    else adventureDocs(docs, out);
  }
}

/** Every raw document the folder has: in its compendia, a world's data/, and scene exports. */
async function rawDocs(src: Source, skipped: string[]): Promise<RawDocs> {
  const out: RawDocs = { scenes: [], journals: [], tables: [], playlists: [] };
  await compendiumDocs(src, out, skipped);
  if (src.kind === 'world')
    for (const [into, file] of Object.entries(WORLD_FILES) as [keyof RawDocs, string][])
      out[into].push(...(await readFoundryDb(join(src.dir, 'data', file))));
  const exports = (await filesUnder(src.dir)).filter((rel) => /(^|\/)fvtt-Scene-[^/]*\.json$/.test(rel));
  for (const rel of exports) out.scenes.push(await readJson(join(src.dir, rel)));
  for (const key of Object.keys(out) as (keyof RawDocs)[])
    out[key] = out[key].filter((d) => d && typeof d === 'object');
  return out;
}

function convertScenes(
  raw: unknown[],
  lookups: SceneLookups & { media: MediaLookup },
  skipped: string[],
): SceneEntry[] {
  const taken = new Set<string>();
  return raw.map((data) => {
    const { scene, skipped: lost } = foundryScene(data, lookups.media, lookups);
    const id = freeId(slugify(scene.name) || 'scene', (x) => taken.has(x), { bare: true });
    taken.add(id);
    skipped.push(...lost.map((what) => `scene "${scene.name}": ${what}`));
    return { id, ...scene };
  });
}

const COMPENDIA = [
  { id: 'scenes', name: 'Scenes', type: 'scene' },
  { id: 'journals', name: 'Journal entries', type: 'journal' },
  { id: 'tables', name: 'Roll tables', type: 'rolltable' },
  { id: 'playlists', name: 'Playlists', type: 'playlist' },
] as const;

/** Writes each non-empty list as a compendium; their manifest entries. */
async function writeCompendia(dir: string, lists: Record<(typeof COMPENDIA)[number]['id'], unknown[]>) {
  const out: PackManifest['compendia'] = [];
  for (const c of COMPENDIA) {
    if (!lists[c.id].length) continue;
    const path = `compendia/${c.id}.json`;
    await writeJson(join(dir, path), lists[c.id]);
    out.push({ ...c, path });
  }
  return out;
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
  const raw = await rawDocs(src, skipped);
  const entries = foundryEntries(raw, media.lookup);
  skipped.push(...entries.skipped);
  const scenes = convertScenes(raw.scenes, { media: media.lookup, ...entries }, skipped);
  const compendia = await writeCompendia(dir, { scenes, ...entries });
  const { manifest: m } = src;
  const manifest: PackManifest = {
    id,
    name: m.title ?? src.foundryId,
    version: m.version === undefined ? '1.0.0' : String(m.version),
    system: null,
    compendia,
    media: 'media/',
    source: `foundry:${src.kind}`,
    ...(authorOf(m) ? { author: authorOf(m) } : {}),
    ...(m.description ? { description: plainText(m.description) } : {}),
  };
  await writeJson(join(dir, 'pack.json'), manifest);
  const documents = entries.journals.length + entries.tables.length + entries.playlists.length;
  return { id, dir, media: media.count, scenes: scenes.length, documents, skipped };
}
