import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type ArtFile, nameKey, type PackManifest } from '@vtt/core';
import { type FoundryDoc, readFoundryDb } from './foundry-db.ts';
import { readJson } from '../store/json-files.ts';

// An icons pack from a Foundry install (see foundry-art-cli.ts): Foundry's
// core icons and its game system's icons and tokens, and an art file that
// names, for each spell, item, feature and monster of the system's
// compendia, the picture Foundry itself gives it. So turning the pack on
// dresses the SRD content the way Foundry does, by name.

/** Where a Foundry picture lies in the pack: core icons under media/icons, the system's under media/<system>. */
export function foundryArtPath(src: string, system: string): string | undefined {
  if (src.startsWith('icons/')) return `media/${src}`;
  const own = `systems/${system}/`;
  return src.startsWith(own) ? `media/${system}/${src.slice(own.length)}` : undefined;
}

/** Foundry's stand-in pictures for documents that have none of their own. */
const PLACEHOLDER = /(^icons\/svg\/)|(\/mystery-man)|(\/item-bag)/;

/** Foundry document types and the art slot each fills. */
const SLOTS: Record<string, string> = {
  spell: 'spell',
  feat: 'feature',
  weapon: 'item',
  equipment: 'item',
  consumable: 'item',
  tool: 'item',
  loot: 'item',
  container: 'item',
  backpack: 'item',
  npc: 'monster',
};

const text = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** A document's picture: a creature's token, anything else's image. */
function pictureOf(doc: FoundryDoc, slot: string): string | undefined {
  if (slot !== 'monster') return text(doc.img);
  const token = doc.prototypeToken as { texture?: { src?: unknown } } | undefined;
  return text(token?.texture?.src) ?? text(doc.img);
}

/** The names a document goes by: its own, and for gear the part before a comma or bracket ("Rope, Hempen" → rope). */
function keysOf(name: string, slot: string): string[] {
  const keys = [nameKey(name)];
  const short = nameKey(name.split(/[,(]/)[0]!);
  if (slot === 'item' && short && short !== keys[0]) keys.push(short);
  return keys;
}

/** The art file for a system's compendium documents: slot → name key → path in the pack. */
export function foundryArtFile(docs: readonly FoundryDoc[], system: string): ArtFile {
  const out: Record<string, Record<string, string>> = {};
  for (const doc of docs) {
    const slot = SLOTS[text(doc.type) ?? ''];
    const name = text(doc.name);
    const src = slot && pictureOf(doc, slot);
    const path = src && !PLACEHOLDER.test(src) ? foundryArtPath(src, system) : undefined;
    if (!slot || !name || !path) continue;
    out[slot] ??= {};
    for (const key of keysOf(name, slot)) out[slot][key] ??= path;
  }
  return out;
}

/** Where Foundry's pictures are: its core icons folder (resources/app/public/icons) and a game system's folder. */
export interface FoundryArtSource {
  icons: string;
  system: string;
}

export interface FoundryArtOptions {
  id?: string;
  overwrite?: boolean;
  /** Write only pack.json and art.json, for media copied some other way. */
  noMedia?: boolean;
}

interface SystemJson {
  id?: string;
  packs?: { path?: string; type?: string }[];
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

/** The documents of a system's item and actor compendia. */
async function systemDocs(system: string, json: SystemJson): Promise<FoundryDoc[]> {
  const packs = (json.packs ?? []).filter((p) => p.path && (p.type === 'Item' || p.type === 'Actor'));
  const lists = await Promise.all(packs.map((p) => readFoundryDb(join(system, p.path!))));
  return lists.flat();
}

/** Copies the core icons and the system's icons and tokens into the pack's media. */
async function copyArt(from: FoundryArtSource, dir: string, system: string): Promise<void> {
  await cp(from.icons, join(dir, 'media/icons'), { recursive: true });
  for (const sub of ['icons', 'tokens']) {
    const src = join(from.system, sub);
    if (await exists(src)) await cp(src, join(dir, 'media', system, sub), { recursive: true });
  }
}

/**
 * Makes an icons pack in `packsDir` from a Foundry install: its core icons,
 * a system's icons and tokens, and an art file naming the picture Foundry
 * gives each document of the system's compendia. Private: Foundry's art is
 * for your own games, never the repo.
 */
export async function importFoundryArt(
  from: FoundryArtSource,
  packsDir: string,
  opts: FoundryArtOptions = {},
): Promise<{ id: string; dir: string; pictures: number }> {
  const json = ((await readJson(join(from.system, 'system.json'))) ?? {}) as SystemJson;
  const system = json.id ?? 'system';
  const id = opts.id ?? 'foundry-icons';
  const dir = join(packsDir, id);
  if ((await exists(dir)) && !opts.noMedia) {
    if (!opts.overwrite)
      throw new Error(`A pack "${id}" is already installed (${dir}); pass --overwrite to replace it.`);
    await rm(dir, { recursive: true, force: true });
  }
  await mkdir(dir, { recursive: true });
  if (!opts.noMedia) await copyArt(from, dir, system);
  const art = foundryArtFile(await systemDocs(from.system, json), system);
  const manifest: PackManifest = {
    id,
    name: `Foundry icons and ${system} tokens (private)`,
    version: '1.0.0',
    system: null,
    license: 'private',
    compendia: [],
    media: 'media/',
    source: `foundry:core icons + ${system}`,
    art: 'art.json',
  };
  await writeFile(join(dir, 'pack.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(dir, 'art.json'), `${JSON.stringify(art, null, 2)}\n`);
  const pictures = Object.values(art).reduce((n, keys) => n + Object.keys(keys).length, 0);
  return { id, dir, pictures };
}
