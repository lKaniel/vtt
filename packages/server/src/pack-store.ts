import { readdir } from 'node:fs/promises';
import { join, normalize, sep } from 'node:path';
import {
  mediaEntry,
  type MediaEntry,
  type PackCompendium,
  type PackManifest,
  PackManifestSchema,
  packRef,
} from '@vtt/core';
import { readJson } from './json-files.ts';

// The asset packs installed on this server: data/packs/<id>/, each with a
// pack.json (see core/packs.ts). Installed by hand or by the Foundry import
// (`pnpm import-foundry`); a game turns on the ones it uses in game.json.
// load() reads them all again, so a pack copied in shows up without a restart.

interface Installed {
  manifest: PackManifest;
  dir: string;
  compendia: PackCompendium[];
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
  private mediaCache = new Map<string, Promise<MediaEntry[]>>();
  /** What load() could not read, one line each. */
  problems: string[] = [];
  /** Goes up on every load, so what is worked out from the packs can be cached until then. */
  revision = 0;

  constructor(readonly dir: string) {}

  async load(): Promise<void> {
    const packs = new Map<string, Installed>();
    const problems: string[] = [];
    const names = await readdir(this.dir).catch(() => [] as string[]);
    for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
      const pack = await this.read(name, problems);
      if (pack) packs.set(pack.manifest.id, pack);
    }
    this.packs = packs;
    this.problems = problems;
    this.mediaCache.clear();
    this.revision++;
  }

  private async read(name: string, problems: string[]): Promise<Installed | undefined> {
    const dir = join(this.dir, name);
    const raw = await readJson(join(dir, 'pack.json'));
    if (raw === undefined) return undefined;
    const parsed = PackManifestSchema.safeParse(raw);
    const where = `${name}/pack.json`;
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      problems.push(`${where}: ${issue.path.join('.')} ${issue.message}`);
      return undefined;
    }
    const manifest = parsed.data;
    if (manifest.id !== name) {
      problems.push(`${where}: its id is "${manifest.id}" but its folder is "${name}"`);
      return undefined;
    }
    const compendia: PackCompendium[] = [];
    for (const info of manifest.compendia) {
      const docs = await readJson(join(dir, info.path));
      if (Array.isArray(docs)) compendia.push({ ...info, pack: manifest.id, docs });
      else problems.push(`${where}: compendium "${info.id}" has no readable list in ${info.path}`);
    }
    return { manifest, dir, compendia };
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
    const installed = this.packs.get(pack);
    if (!installed) return Promise.resolve([]);
    let listed = this.mediaCache.get(pack);
    if (!listed) {
      listed = this.listMedia(installed);
      this.mediaCache.set(pack, listed);
    }
    return listed;
  }

  private async listMedia({ manifest, dir }: Installed): Promise<MediaEntry[]> {
    const folder = mediaFolder(manifest);
    const files = await filesUnder(join(dir, folder));
    return files.flatMap((rel) => mediaEntry(packRef(manifest.id, `${folder}/${rel}`), rel, manifest.id) ?? []);
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
