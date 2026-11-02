import { statSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
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
    const path = decoded(raw).replace(/^\/+/, '').replace(/\\/g, '/');
    const file = this.used.get(path) ?? this.find(path);
    if (!file) return undefined;
    this.used.set(path, file);
    return `/assets/foundry/${path}`;
  };

  /** Copies every file used into `assets/foundry/` of the game folder; how many. */
  async copyTo(game: string): Promise<number> {
    for (const [path, file] of this.used) {
      const to = join(game, 'assets', 'foundry', path);
      await mkdir(dirname(to), { recursive: true });
      await copyFile(file, to);
    }
    return this.used.size;
  }
}
