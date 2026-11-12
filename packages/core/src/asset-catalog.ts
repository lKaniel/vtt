import { z } from 'zod';
import { InnerPathSchema } from './packs.ts';

// An asset catalog: the map pieces of a pack, each with its real size, so a
// map can be built from them by name: a 2D tile (a tree seen from above, a
// boulder, a cart), a tileable texture (grass, flagstones) or a 3D model.
// A pack keeps it beside its pack.json as `catalog.json`, made by
// `pnpm build-asset-catalog` from its media (picture sizes and glTF bounds).
// Sizes are feet, so the same asset fits any grid.

export const CatalogAssetSchema = z.object({
  /** Unique in the pack: lowercase words and digits joined by dashes. */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  /** The file, inside the pack (`media/...`). */
  src: InnerPathSchema,
  /** `tile`: a picture placed at its size; `texture`: a picture that repeats (ground, floors); `model`: a 3D model. */
  kind: z.enum(['tile', 'texture', 'model']),
  name: z.string(),
  /** Words to find it by: its folders and file name. */
  tags: z.array(z.string()),
  /** Feet across (map x) and down (map y); for a texture, the feet one repeat covers. */
  w: z.number().positive(),
  h: z.number().positive(),
  /** Feet tall (models). */
  height: z.number().nonnegative().optional(),
  /** A small picture of it (a model's preview). */
  thumb: InnerPathSchema.optional(),
  /** Usually drawn over creatures: a tree's crown, a roof. */
  overhead: z.boolean().optional(),
});
export type CatalogAsset = z.infer<typeof CatalogAssetSchema>;

/** A catalog asset of an installed pack, its src (and thumb) a `pack://` reference. */
export interface PackAsset extends CatalogAsset {
  pack: string;
}

export const AssetCatalogSchema = z.object({
  format: z.literal(1),
  /** What made it, e.g. "baileywiki". */
  source: z.string().optional(),
  assets: z.array(CatalogAssetSchema),
});
export type AssetCatalog = z.infer<typeof AssetCatalogSchema>;

/** The words a path is found by: folders and file name, lowercase, without numbers or the file type. */
export function wordsOf(path: string): string[] {
  const noExt = path.replace(/\.[a-z0-9]+$/i, '');
  return noExt
    .toLowerCase()
    .split(/[/\\_\-.\s()]+/)
    .filter((w) => w && /[a-z]/.test(w));
}

/** A word without its plural ending, so "trees" finds "tree". */
const stem = (w: string): string => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

const hits = (word: string, tokens: readonly string[]): boolean => {
  const q = stem(word);
  return tokens.some((t) => t.startsWith(q) || stem(t) === q);
};

export const AssetQuerySchema = z.object({
  /** Words that must all match (an id with a dash or digit finds that asset alone). */
  search: z.string().max(200).optional(),
  kind: CatalogAssetSchema.shape.kind.optional(),
  /** Feet its longer side is at least / at most. */
  minFeet: z.number().nonnegative().optional(),
  maxFeet: z.number().positive().optional(),
});
export type AssetQuery = z.infer<typeof AssetQuerySchema>;

const fits = (a: CatalogAsset, q: AssetQuery): boolean => {
  const size = Math.max(a.w, a.h);
  if (q.kind && a.kind !== q.kind) return false;
  if (q.minFeet !== undefined && size < q.minFeet) return false;
  return q.maxFeet === undefined || size <= q.maxFeet;
};

/** How well an asset matches the words: two for a word in its name, one for one in its tags; 0 when one is missing. */
function score(a: CatalogAsset, words: readonly string[]): number {
  const name = wordsOf(a.name);
  let total = 0;
  for (const w of words) {
    if (hits(w, name)) total += 2;
    else if (hits(w, a.tags)) total += 1;
    else return 0;
  }
  return total;
}

/** The assets matching a query, best first (catalog order among equals). */
export function findAssets<T extends CatalogAsset>(assets: readonly T[], q: AssetQuery): T[] {
  const search = q.search?.trim().toLowerCase() ?? '';
  // An id (it has a dash or a digit) finds that asset alone; a bare word that is also an id is searched for.
  const exact = /[-\d]/.test(search) ? assets.find((a) => a.id === search) : undefined;
  if (exact && fits(exact, q)) return [exact];
  const words = search.split(/[\s,]+/).filter(Boolean);
  const scored: { a: T; s: number; i: number }[] = [];
  assets.forEach((a, i) => {
    if (!fits(a, q)) return;
    const s = words.length ? score(a, words) : 1;
    if (s > 0) scored.push({ a, s, i });
  });
  return scored.sort((x, y) => y.s - x.s || x.i - y.i).map((x) => x.a);
}

/** A number from 0 to 1 that a seed always gives. */
export function seeded(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** One asset for an id or words: the id's, or one of the best matches chosen by `seed` (so maps vary but rebuild the same). */
export function pickAsset<T extends CatalogAsset>(
  assets: readonly T[],
  what: string,
  opts: Omit<AssetQuery, 'search'> & { seed?: number } = {},
): T | undefined {
  const found = findAssets(assets, { ...opts, search: what });
  if (found.length <= 1) return found[0];
  const words = what.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const best = score(found[0]!, words);
  const top = found.filter((a) => score(a, words) === best);
  return top[Math.floor(seeded(opts.seed ?? 0) * top.length)];
}
