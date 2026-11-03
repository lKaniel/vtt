import { z } from 'zod';
import { InnerPathSchema, packRef } from './packs.ts';

// What a pack's pictures and animations are for: a system's content (D&D:
// spells, items, features, conditions, monsters, attack animations), so
// turning a pack on dresses the whole game without picking art per item.
// A pack names them in an art file (pack.json `art`), and the system
// matches the rest by file and folder names (SystemDefinition.packArt).
// A game's art is the art of the packs it uses, the first listed winning.

/** Art by slot (a system's word: "spell", "item", "animation"...) then key (an id), as `pack://` srcs. */
export type ArtIndex = Record<string, Record<string, string[]>>;

/** A pack's art file: slot → key → a file in the pack, or several (variants, e.g. by distance). */
export const ArtFileSchema = z.record(
  z.string(),
  z.record(z.string(), z.union([InnerPathSchema, z.array(InnerPathSchema).min(1)])),
);
export type ArtFile = z.infer<typeof ArtFileSchema>;

/** An art file's paths as `pack://` srcs of `pack`. */
export function artFromFile(pack: string, file: ArtFile): ArtIndex {
  const out: ArtIndex = {};
  for (const [slot, keys] of Object.entries(file)) {
    out[slot] = {};
    for (const [key, paths] of Object.entries(keys)) {
      out[slot][key] = (Array.isArray(paths) ? paths : [paths]).map((p) => packRef(pack, p));
    }
  }
  return out;
}

/** The art of several packs together: each key from the first that has it. */
export function mergeArt(indexes: readonly ArtIndex[]): ArtIndex {
  const out: ArtIndex = {};
  for (const index of indexes) {
    for (const [slot, keys] of Object.entries(index)) {
      out[slot] = { ...keys, ...out[slot] };
    }
  }
  return out;
}

/** The art for the first of `keys` a slot has. */
export function artOf(art: ArtIndex, slot: string, ...keys: readonly string[]): string[] | undefined {
  const known = art[slot];
  if (!known) return undefined;
  for (const key of keys) {
    if (Object.hasOwn(known, key)) return known[key];
  }
  return undefined;
}

/** A name as an id-like key: lowercase words joined by dashes ("BrownBear", "brown_bear" → "brown-bear"). */
export function nameKey(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('-');
}
