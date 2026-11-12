import { readdir } from 'node:fs/promises';
import { join, normalize, sep } from 'node:path';
import {
  AssetCatalogSchema,
  type PackAsset,
  artFromFile,
  ArtFileSchema,
  type ArtIndex,
  mediaEntry,
  type MediaEntry,
  CompendiumStubSchema,
  type MediaIndex,
  MediaIndexSchema,
  type PackCompendium,
  type PackManifest,
  PackManifestSchema,
  packRef,
} from '@vtt/core';
import { readJson } from '../store/json-files.ts';
import { type Found, readManifests } from './manifests.ts';

// The asset packs installed on this server: data/packs/<id>/, each with a
// pack.json (see core/packs.ts). Installed by hand or by the Foundry import
// (`pnpm import-foundry`); a game turns on the ones it uses in game.json.
// load() reads them all again, so a pack copied in shows up without a restart.

interface Installed {
  manifest: PackManifest;
  dir: string;
  compendia: PackCompendium[];
  /** Its art file's art (pack.json `art`), as pack srcs. */
  art: ArtIndex;
}

/** Every file under `dir`, as paths relative to it with forward slashes. */
export async function filesUnder(dir: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(join(dir, prefix), { withFileTypes: true }).catch(() => []);
  const out: string[] = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await filesUnder(dir, rel)));
    else if (e.isFile()) out.push(rel);
  }
  return out;
}

/** The media folder without its trailing slashes. */
function mediaFolder(m: PackManifest): string {
  let folder = m.media;
  while (folder.endsWith('/')) folder = folder.slice(0, -1);
  return folder;
}

export class PackStore {
  private packs = new Map<string, Installed>();
  private listed = new Map<string, MediaEntry[]>();
  private catalogs = new Map<string, Promise<PackAsset[]>>();
  /** What load() could not read, one line each. */
  problems: string[] = [];
  /** Goes up on every load, so what is worked out from the packs can be cached until then. */
  revision = 0;

  constructor(readonly dir: string) {}

  async load(): Promise<void> {
    const packs = new Map<string, Installed>();
    const problems: string[] = [];
    const listed = new Map<string, MediaEntry[]>();
    for (const found of await readManifests(this.dir, 'pack.json', PackManifestSchema, problems)) {
      const installed = await this.withCompendia(found, problems);
      packs.set(found.manifest.id, installed);
      listed.set(found.manifest.id, await listMedia(installed));
    }
    this.packs = packs;
    this.listed = listed;
    this.catalogs = new Map();
    this.problems = problems;
    this.revision++;
  }

  /** A pack with its compendia read; one that can't be read is reported. */
  private async withCompendia({ manifest, dir }: Found<PackManifest>, problems: string[]): Promise<Installed> {
    const where = `${manifest.id}/pack.json`;
    const compendia: PackCompendium[] = [];
    for (const info of manifest.compendia) {
      const docs = info.split ? await readIndex(join(dir, info.path)) : await readJson(join(dir, info.path));
      if (Array.isArray(docs)) compendia.push({ ...info, pack: manifest.id, docs });
      else problems.push(`${where}: compendium "${info.id}" has no readable list in ${info.path}`);
    }
    return { manifest, dir, compendia, art: await readArt({ manifest, dir }, problems) };
  }

  list(): PackManifest[] {
    return [...this.packs.values()].map((p) => p.manifest);
  }

  get(id: string): PackManifest | undefined {
    return this.packs.get(id)?.manifest;
  }

  /** The compendia of a pack, as read on load. */
  compendia(pack: string): PackCompendium[] {
    return this.packs.get(pack)?.compendia ?? [];
  }

  compendium(pack: string, id: string): PackCompendium | undefined {
    return this.compendia(pack).find((c) => c.id === id);
  }

  /** One document of a compendium by id: a split compendium's is read from its file. */
  async compendiumDoc(pack: string, compendium: string, id: string): Promise<unknown> {
    const c = this.compendium(pack, compendium);
    const dir = this.packs.get(pack)?.dir;
    if (!c || !dir) return undefined;
    if (!c.split) return c.docs.find((d) => (d as { id?: unknown }).id === id);
    if (!SAFE_ID.test(id) || !c.docs.some((d) => (d as { id: string }).id === id)) return undefined;
    return readJson(join(dir, c.path, `${id}.json`));
  }

  /** The pictures, sounds and videos in a pack's media folder, tagged with their folders. */
  media(pack: string): Promise<MediaEntry[]> {
    return Promise.resolve(this.listedMedia(pack));
  }

  /** A pack's media as listed on load. */
  listedMedia(pack: string): MediaEntry[] {
    return this.listed.get(pack) ?? [];
  }

  /** What a pack's art file names (pack.json `art`); empty without one. */
  art(pack: string): ArtIndex {
    return this.packs.get(pack)?.art ?? {};
  }

  /**
   * A pack's asset catalog (its catalog.json, core/asset-catalog.ts), with
   * pack srcs; empty without one. Read when first asked for after a load.
   */
  catalog(pack: string): Promise<PackAsset[]> {
    const installed = this.packs.get(pack);
    if (!installed) return Promise.resolve([]);
    let got = this.catalogs.get(pack);
    if (!got) {
      got = readCatalog(installed, this.problems);
      this.catalogs.set(pack, got);
    }
    return got;
  }

  /** The file a `pack://<pack>/<path>` names, if it is in the pack's media folder. */
  mediaFile(pack: string, path: string): string | undefined {
    const installed = this.packs.get(pack);
    if (!installed) return undefined;
    const root = normalize(join(installed.dir, mediaFolder(installed.manifest)));
    const file = normalize(join(installed.dir, path));
    return file.startsWith(root + sep) ? file : undefined;
  }
}

/** A document id that names a file in a split compendium's folder. */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** A split compendium's index, as stubs; undefined when it can't be read. */
async function readIndex(folder: string): Promise<unknown[] | undefined> {
  const raw = await readJson(join(folder, 'index.json'));
  if (!Array.isArray(raw)) return undefined;
  return raw.flatMap((entry) => {
    const parsed = CompendiumStubSchema.safeParse(entry);
    return parsed.success ? [{ ...parsed.data, stub: true }] : [];
  });
}

async function readMediaIndex({ manifest, dir }: Pick<Installed, 'manifest' | 'dir'>): Promise<MediaIndex> {
  if (!manifest.mediaIndex) return {};
  return MediaIndexSchema.safeParse(await readJson(join(dir, manifest.mediaIndex))).data ?? {};
}

async function readCatalog({ manifest, dir }: Pick<Installed, 'manifest' | 'dir'>, problems: string[]) {
  const file = await readJson(join(dir, 'catalog.json'));
  if (file === undefined) return [];
  const parsed = AssetCatalogSchema.safeParse(file);
  if (!parsed.success) {
    problems.push(`${manifest.id}/catalog.json: not an asset catalog`);
    return [];
  }
  const ref = (p: string) => packRef(manifest.id, p);
  return parsed.data.assets.map((a): PackAsset => ({
    ...a,
    src: ref(a.src),
    ...(a.thumb && { thumb: ref(a.thumb) }),
    pack: manifest.id,
  }));
}

async function listMedia(installed: Pick<Installed, 'manifest' | 'dir'>): Promise<MediaEntry[]> {
  const { manifest, dir } = installed;
  const folder = mediaFolder(manifest);
  const files = await filesUnder(join(dir, folder));
  const index = await readMediaIndex(installed);
  const thumbs = new Set(Object.values(index).flatMap((e) => (e.thumb ? [e.thumb] : [])));
  const ref = (rel: string) => packRef(manifest.id, `${folder}/${rel}`);
  return files.flatMap((rel) => {
    if (thumbs.has(rel)) return [];
    const entry = mediaEntry(ref(rel), rel, manifest.id);
    return entry ? [indexed(entry, index[rel], ref)] : [];
  });
}

/** A media entry with what the pack's media index says about it. */
function indexed(entry: MediaEntry, extra: MediaIndex[string] | undefined, ref: (rel: string) => string): MediaEntry {
  if (!extra) return entry;
  const tags = [...new Set([...entry.tags, ...(extra.tags ?? [])])];
  return { ...entry, tags, ...(extra.thumb ? { thumb: ref(extra.thumb) } : {}) };
}

/** A pack's art file as pack srcs; one that can't be read is reported. */
async function readArt({ manifest, dir }: Found<PackManifest>, problems: string[]): Promise<ArtIndex> {
  if (!manifest.art) return {};
  const parsed = ArtFileSchema.safeParse(await readJson(join(dir, manifest.art)));
  if (parsed.success) return artFromFile(manifest.id, parsed.data);
  problems.push(`${manifest.id}/pack.json: its art file ${manifest.art} is not a list of pack files by kind`);
  return {};
}
