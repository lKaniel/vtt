import { copyFile, link, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { type MediaIndex, mediaKind, packRef } from '@vtt/core';
import { filesUnder } from '../library/pack-store.ts';

// The files of installed Baileywiki modules, for the `baileywiki` pack:
// each module's media is copied (or hard-linked, on the same drive) to
// media/modules/<module>/<path>, the path Foundry gives it, so every
// reference from any module's scenes and prefabs finds it. Mass Edit's
// "virtual directory" (mass_edit_cache.json, gzipped JSON) gives the
// search tags Baileywiki put on files and each 3D model's thumbnail.

/** Files a module's media needs beside pictures, sounds, videos and models: glTF buffers. */
const isMediaFile = (rel: string) => !!mediaKind(rel) || /\.bin$/i.test(rel);

/** Top-level folders of a module that hold code or databases. */
const NOT_MEDIA = new Set([
  'packs',
  'scripts',
  'module',
  'styles',
  'lang',
  'languages',
  'templates',
  'node_modules',
  '.git',
]);

export interface MediaRun {
  /** The pack folder. */
  dir: string;
  pack: string;
  /** Hard-link instead of copying where the drive allows it. */
  link?: boolean;
  /** Paths in the media folder (modules/<module>/<path>) of every file the pack has. */
  have: Set<string>;
  copied: number;
}

const sizeOf = (path: string) =>
  stat(path).then(
    (s) => s.size,
    () => -1,
  );

async function copyOne(run: MediaRun, from: string, to: string): Promise<void> {
  const size = await sizeOf(to);
  if (size >= 0 && size === (await sizeOf(from))) return;
  await mkdir(dirname(to), { recursive: true });
  if (run.link && size < 0) {
    const linked = await link(from, to).then(
      () => true,
      () => false,
    );
    if (linked) {
      run.copied++;
      return;
    }
  }
  await copyFile(from, to);
  run.copied++;
}

/** Copies the media of the module in `moduleDir` (its id `module`); files already there at the same size stay. */
export async function copyModuleMedia(run: MediaRun, moduleDir: string, module: string): Promise<number> {
  const files = (await filesUnder(moduleDir)).filter((rel) => !NOT_MEDIA.has(rel.split('/')[0]!) && isMediaFile(rel));
  for (const rel of files) {
    const inPack = `modules/${module}/${rel}`;
    await copyOne(run, join(moduleDir, rel), join(run.dir, 'media', inPack));
    run.have.add(inPack);
  }
  return files.length;
}

const decoded = (path: string) => {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};

/** The `pack://` reference of a Foundry data path (modules/<module>/...), if the pack has the file. */
export function mediaLookup(run: Pick<MediaRun, 'have' | 'pack'>, missing?: Set<string>) {
  return (foundryPath: string): string | undefined => {
    const path = decoded(foundryPath.replace(/^\/+/, '').split('?')[0]!);
    if (run.have.has(path)) return packRef(run.pack, `media/${path}`);
    missing?.add(path);
    return undefined;
  };
}

interface CacheDir {
  dir?: string;
  dirs?: CacheDir[];
  files?: { name?: string; tags?: unknown; thumb?: unknown }[];
}

const strings = (x: unknown) => (Array.isArray(x) ? x.filter((t): t is string => typeof t === 'string' && !!t) : []);

const joined = (at: string, dir: string | undefined) => {
  if (!dir) return at;
  return at ? `${at}/${dir}` : dir;
};

/** A cache file's tags and thumbnail, if it has either. */
function entryOf(f: NonNullable<CacheDir['files']>[number], here: string): MediaIndex[string] | undefined {
  const tags = strings(f.tags);
  const thumb = typeof f.thumb === 'string' && f.thumb ? `${here}/${f.thumb}` : undefined;
  if (!tags.length && !thumb) return undefined;
  return { ...(tags.length ? { tags } : {}), ...(thumb ? { thumb } : {}) };
}

function walk(node: CacheDir, at: string, out: MediaIndex): void {
  const here = joined(at, node.dir);
  for (const f of node.files ?? []) {
    const entry = f.name ? entryOf(f, here) : undefined;
    if (entry) out[`${here}/${f.name}`] = entry;
  }
  for (const d of node.dirs ?? []) walk(d, here, out);
}

/** The tags and thumbnails of a module's Mass Edit cache (by path from the data folder); empty without one. */
export async function readMassEditCache(moduleDir: string): Promise<MediaIndex> {
  const raw = await readFile(join(moduleDir, 'mass_edit_cache.json')).catch(() => undefined);
  if (!raw) return {};
  let parsed: unknown;
  try {
    const json = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw).toString('utf8') : raw.toString('utf8');
    parsed = JSON.parse(json);
  } catch {
    return {};
  }
  const out: MediaIndex = {};
  for (const source of Array.isArray(parsed) ? (parsed as { index?: CacheDir[] }[]) : [])
    for (const root of source.index ?? []) walk(root, '', out);
  return out;
}
