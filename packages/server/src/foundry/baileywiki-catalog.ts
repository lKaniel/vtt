import { type AssetCatalog, type CatalogAsset, mediaKind, slugify, wordsOf } from '@vtt/core';
import type { Prefab, Tile } from '@vtt/shared';

// Claude's map tools find pieces in a pack's asset catalog (core
// asset-catalog.ts). A server without Baileywiki's media on disk (they are
// fetched when first used, baileywiki-files.ts) can't measure the files, so
// its catalog comes from the prefabs instead: every picture and model they
// place, at the size the prefab gives it, named and tagged as the prefab.

const PREFIX = 'pack://baileywiki/';
const OVERHEAD = /tree|canop|roof|awning|overhang/i;

export interface GriddedPrefab {
  prefab: Pick<Prefab, 'name' | 'tags' | 'thumb' | 'fill'> & { tiles: readonly Tile[] };
  /** Pixels per 5 ft square of the scene the prefab was made in. */
  grid: number;
}

type ImageTile = Extract<Tile, { kind: 'image' }>;

const inPack = (ref: string | undefined) => (ref?.startsWith(PREFIX) ? ref.slice(PREFIX.length) : undefined);
const feet = (px: number, grid: number) => Math.max(Math.round((px / grid) * 5 * 10) / 10, 0.1);

/** What a tile puts down: its model, its repeating picture, or its picture. */
function pieceOf(t: ImageTile, fill: boolean | undefined): { src?: string; kind: CatalogAsset['kind'] } {
  if (t.model) return { src: inPack(t.model.src), kind: 'model' };
  if (t.repeat || fill) return { src: inPack(t.repeat?.src ?? t.src), kind: 'texture' };
  return { src: inPack(t.src), kind: 'tile' };
}

/** The extra fields of an asset: a model's height and picture, a tile drawn overhead. */
function extrasOf(t: ImageTile, kind: CatalogAsset['kind'], src: string, thumb: string | undefined) {
  return {
    ...(t.model?.height ? { height: t.model.height } : {}),
    ...(kind === 'model' && thumb ? { thumb } : {}),
    ...(kind === 'tile' && (t.overhead || OVERHEAD.test(src)) ? { overhead: true } : {}),
  };
}

const fileName = (src: string) =>
  src
    .split('/')
    .at(-1)!
    .replace(/\.[^.]+$/, '');

class Catalog {
  readonly assets: CatalogAsset[] = [];
  private seen = new Set<string>();
  private taken = new Set<string>();

  private id(src: string): string {
    const base = slugify(fileName(src)) || 'asset';
    let id = base;
    let n = 2;
    while (this.taken.has(id)) {
      id = `${base}-${n}`;
      n++;
    }
    this.taken.add(id);
    return id;
  }

  add({ prefab, grid }: GriddedPrefab, t: ImageTile): void {
    const { src, kind } = pieceOf(t, prefab.fill);
    if (!src || (kind !== 'model' && mediaKind(src) !== 'image') || this.seen.has(src)) return;
    this.seen.add(src);
    const one = prefab.tiles.length === 1;
    const tags = [...new Set([...(prefab.tags ?? []).flatMap(wordsOf), ...wordsOf(src)])];
    this.assets.push({
      id: this.id(src),
      src,
      kind,
      name: one ? prefab.name : `${prefab.name}: ${fileName(src).replace(/[_-]+/g, ' ')}`,
      tags,
      w: feet(t.w, grid),
      h: feet(t.h, grid),
      ...extrasOf(t, kind, src, inPack(prefab.thumb)),
    });
  }
}

/** The catalog of the pictures and models in Baileywiki's prefabs, each once. */
export function prefabCatalog(prefabs: readonly GriddedPrefab[]): AssetCatalog {
  const catalog = new Catalog();
  for (const p of prefabs) for (const t of p.prefab.tiles) if (t.kind === 'image') catalog.add(p, t);
  return { format: 1, source: 'baileywiki-prefabs', assets: catalog.assets };
}
