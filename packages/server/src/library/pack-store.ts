import { readdir } from 'node:fs/promises';
import { join, normalize, sep } from 'node:path';
import {
  artFromFile,
  ArtFileSchema,
  type ArtIndex,
  mediaEntry,
  type MediaEntry,
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
    this.problems = problems;
    this.revision++;
  }

  /** A pack with its compendia read; one that can't be read is reported. */
  private async withCompendia({ manifest, dir }: Found<PackManifest>, problems: string[]): Promise<Installed> {
    const where = `${manifest.id}/pack.json`;
    const compendia: PackCompendium[] = [];
    for (const info of manifest.compendia) {
      const docs = await readJson(join(dir, info.path));
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

  /** The file a `pack://<pack>/<path>` names, if it is in the pack's media folder. */
  mediaFile(pack: string, path: string): string | undefined {
    const installed = this.packs.get(pack);
    if (!installed) return undefined;
    const root = normalize(join(installed.dir, mediaFolder(installed.manifest)));
    const file = normalize(join(installed.dir, path));
    return file.startsWith(root + sep) ? file : undefined;
  }
}

async function listMedia({ manifest, dir }: Pick<Installed, 'manifest' | 'dir'>): Promise<MediaEntry[]> {
  const folder = mediaFolder(manifest);
  const files = await filesUnder(join(dir, folder));
  return files.flatMap((rel) => mediaEntry(packRef(manifest.id, `${folder}/${rel}`), rel, manifest.id) ?? []);
}

/** A pack's art file as pack srcs; one that can't be read is reported. */
async function readArt({ manifest, dir }: Found<PackManifest>, problems: string[]): Promise<ArtIndex> {
  if (!manifest.art) return {};
  const parsed = ArtFileSchema.safeParse(await readJson(join(dir, manifest.art)));
  if (parsed.success) return artFromFile(manifest.id, parsed.data);
  problems.push(`${manifest.id}/pack.json: its art file ${manifest.art} is not a list of pack files by kind`);
  return {};
}
