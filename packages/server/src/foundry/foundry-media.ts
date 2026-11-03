import { readdirSync, statSync } from 'node:fs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';
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
      if (path.toLowerCase().endsWith('.gltf')) await copyParts(file, to);
    }
    return this.used.size;
  }
}

/** The files a .gltf names beside it (buffers, textures), never outside its folder or embedded. */
async function partsOf(file: string): Promise<string[]> {
  try {
    const gltf = JSON.parse(await readFile(file, 'utf8')) as {
      buffers?: { uri?: unknown }[];
      images?: { uri?: unknown }[];
    };
    const uris = [...(gltf.buffers ?? []), ...(gltf.images ?? [])].map((b) => b.uri);
    return uris
      .filter((u): u is string => typeof u === 'string' && !u.startsWith('data:'))
      .map((u) => decoded(u))
      .filter((u) => !u.split('/').includes('..') && !isAbsolute(u));
  } catch {
    return [];
  }
}

/** Copies a .gltf's own files from beside `file` to beside `to`. */
async function copyParts(file: string, to: string): Promise<void> {
  for (const part of await partsOf(file)) {
    const from = join(dirname(file), part);
    if (!isFile(from)) continue;
    await mkdir(dirname(join(dirname(to), part)), { recursive: true });
    await copyFile(from, join(dirname(to), part));
  }
}
