import { describe, expect, it } from 'vitest';
import { AssetCatalogSchema, type CatalogAsset, findAssets, pickAsset, wordsOf } from './index.ts';

const asset = (id: string, path: string, kind: CatalogAsset['kind'] = 'tile', w = 10, h = 10): CatalogAsset => ({
  id,
  src: `media/${path}`,
  kind,
  name: id,
  tags: wordsOf(path),
  w,
  h,
});

const catalog = [
  asset('oak-01', 'wilderness/trees/bw_tree_oak_01.webp', 'tile', 30, 30),
  asset('oak-02', 'wilderness/trees/bw_tree_oak_02.webp', 'tile', 25, 25),
  asset('pine-01', 'wilderness/trees/bw_tree_pine_01.webp', 'tile', 20, 20),
  asset('boulder-01', 'wilderness/boulders/bw_desert_boulder_224.webp', 'tile', 5, 5),
  asset('forest-01', 'wilderness/forest/bw-forest-01-4k-tileable.webp', 'texture', 135, 135),
  asset('oak-3d', 'props-natural/trees/mar24-tree-oak-14.glb', 'model', 20, 20),
];

describe('a catalog file', () => {
  it('reads assets with sizes in feet, and refuses paths that leave the pack', () => {
    const file = { format: 1, assets: [asset('a', 'x/a.webp')] };
    expect(AssetCatalogSchema.parse(file).assets[0]!.w).toBe(10);
    expect(AssetCatalogSchema.safeParse({ format: 1, assets: [{ ...file.assets[0], src: '../a.webp' }] }).success).toBe(
      false,
    );
  });
});

describe('words of a path', () => {
  it('splits folders and file name into lowercase words, without numbers and file type', () => {
    expect(wordsOf('wilderness/00-2025-01-release/bushes/bw_plant_bush_dead_201.webp')).toEqual([
      'wilderness',
      'release',
      'bushes',
      'bw',
      'plant',
      'bush',
      'dead',
    ]);
  });
});

describe('finding assets', () => {
  it('needs every word, matching the start of a word or its plural', () => {
    expect(findAssets(catalog, { search: 'oak tree' }).map((a) => a.id)).toEqual(['oak-01', 'oak-02', 'oak-3d']);
    expect(findAssets(catalog, { search: 'boulders' }).map((a) => a.id)).toEqual(['boulder-01']);
  });

  it('filters by kind and size', () => {
    expect(findAssets(catalog, { search: 'tree', kind: 'model' }).map((a) => a.id)).toEqual(['oak-3d']);
    expect(findAssets(catalog, { search: 'tree', kind: 'tile', maxFeet: 25 }).map((a) => a.id)).toEqual([
      'oak-02',
      'pine-01',
    ]);
  });

  it('puts assets whose own name has the words first', () => {
    const found = findAssets(catalog, { search: 'forest' });
    expect(found[0]!.id).toBe('forest-01');
  });

  it('finds by id', () => {
    expect(findAssets(catalog, { search: 'pine-01' }).map((a) => a.id)).toEqual(['pine-01']);
  });

  it('searches a bare word that is also an id, so other kinds still find theirs', () => {
    const withOak = [...catalog, asset('oak', 'props/oak.glb', 'model')];
    expect(findAssets(withOak, { search: 'oak', kind: 'tile' }).map((a) => a.id)).toEqual(['oak-01', 'oak-02']);
  });
});

describe('picking an asset', () => {
  it('takes an id as it is', () => {
    expect(pickAsset(catalog, 'boulder-01')?.id).toBe('boulder-01');
  });

  it('picks among matches by the seed, the same seed the same one', () => {
    const a = pickAsset(catalog, 'tree', { kind: 'tile', seed: 1 });
    const b = pickAsset(catalog, 'tree', { kind: 'tile', seed: 1 });
    expect(a).toEqual(b);
    const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => pickAsset(catalog, 'tree', { kind: 'tile', seed })!.id));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('is undefined when nothing matches', () => {
    expect(pickAsset(catalog, 'dragon')).toBeUndefined();
  });
});
