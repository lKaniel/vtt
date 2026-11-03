import { readdirSync, statSync } from 'node:fs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, posix } from 'node:path';
import { mediaKind } from '@vtt/core';
import type { MediaLookup } from './foundry-scene.ts';

// The pictures and sounds a Foundry world uses, copied into the game's
// assets/foundry/ under their Foundry path. Foundry names files by their
// path in its Data folder (worlds/<id>/..., modules/..., or any folder the
// GM made there), so a world's map can live outside the world: we look in
// the Data folder the world sits in, or the one given.

/** The Data folder a world folder sits in (Data/worlds/<id>), if it does. */
export const dataFolderOf = (world: string): string | undefined =>
  basename(dirname(world)) === 'worlds' ? dirname(dirname(world)) : undefined;

const decoded = (path: string) => {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};

const isFile = (path: string) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

/** A file on The Forge's CDN, by its path in the Data folder (`<user id>/` or `bazaar/` before it). */
const FORGE = /^https?:\/\/assets\.forge-vtt\.com\/[^/]+\/(.+)$/;

export class FoundryMedia {
  /** Foundry path to the file on disk, for each file a document used. */
  private used = new Map<string, string>();

  constructor(
    private world: { dir: string; id: string },
    private data: string | undefined,
  ) {}

  /** Where a Foundry path is on disk; only media files, never outside the folders. */
  private find(path: string): string | undefined {
    if (path.split('/').includes('..') || !mediaKind(path)) return undefined;
    const own = `worlds/${this.world.id}/`;
    const places = [
      ...(this.data ? [join(this.data, path)] : []),
      ...(path.startsWith(own) ? [join(this.world.dir, path.slice(own.length))] : []),
    ];
    return places.find(isFile);
  }

  /** Our URL for a Foundry path: a copied file's, or a web address as it is. */
  readonly lookup: MediaLookup = (raw) => {
    const forge = FORGE.exec(raw);
    if (forge) return this.lookup(forge[1]!) ?? raw;
    if (/^https?:\/\//.test(raw)) return raw;
    // Tokenizer and Foundry's uploads add a cache-busting `?1693669309657` to the path.
    const path = decoded(raw.split(/[?#]/)[0]!).replace(/^\/+/, '').replace(/\\/g, '/');
    const file = this.used.get(path) ?? this.find(path);
    if (!file) return undefined;
    this.used.set(path, file);
    return `/assets/foundry/${path}`;
  };

  /** Every media file a Foundry pattern with `*` in its name matches ("maps/bw_tree*"), as our URLs, by name. */
  glob(pattern: string): string[] {
    const path = decoded(pattern).replace(/^\/+/, '');
    const dir = dirname(path);
    const name = new RegExp(
      `^${basename(path)
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')}$`,
      'i',
    );
    if (dir.split('/').includes('..') || !this.data) return [];
    let files: string[];
    try {
      files = readdirSync(join(this.data, dir));
    } catch {
      return [];
    }
    return files
      .filter((f) => name.test(f))
      .sort((a, b) => a.localeCompare(b))
      .flatMap((f) => this.lookup(dir === '.' ? f : `${dir}/${f}`) ?? []);
  }

  /** Copies every file used into `assets/foundry/` of the game folder; how many. */
  async copyTo(game: string): Promise<number> {
    for (const [path, file] of this.used) {
      const to = join(game, 'assets', 'foundry', path);
      await mkdir(dirname(to), { recursive: true });
      await copyFile(file, to);
      if (await isGltfText(file)) await copyParts(file, path, game);
    }
    return this.used.size;
  }
}

/** Whether a model file is glTF text (JSON naming its parts), whatever its name says: some kits call them .glb. */
async function isGltfText(file: string): Promise<boolean> {
  if (!/\.(gltf|glb)$/i.test(file)) return false;
  const head = (await readFile(file)).subarray(0, 64).toString('utf8').trimStart();
  return head.startsWith('{');
}

/** The files a glTF names (buffers, textures), as Data-folder paths, never outside it or embedded. */
async function partsOf(file: string, path: string): Promise<string[]> {
  try {
    const gltf = JSON.parse(await readFile(file, 'utf8')) as {
      buffers?: { uri?: unknown }[];
      images?: { uri?: unknown }[];
    };
    const uris = [...(gltf.buffers ?? []), ...(gltf.images ?? [])].map((b) => b.uri);
    return uris
      .filter((u): u is string => typeof u === 'string' && !u.startsWith('data:') && !isAbsolute(u))
      .map((u) => posix.normalize(posix.join(posix.dirname(path), decoded(u))))
      .filter((p) => !p.startsWith('../') && p !== '..' && !isAbsolute(p));
  } catch {
    return [];
  }
}

/** Copies a glTF's own files, found from `file` (at Data path `path`), into the game at their Data paths. */
async function copyParts(file: string, path: string, game: string): Promise<void> {
  for (const part of await partsOf(file, path)) {
    const from = join(dirname(file), posix.relative(posix.dirname(path), part));
    if (!isFile(from)) continue;
    const to = join(game, 'assets', 'foundry', part);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
  }
}
