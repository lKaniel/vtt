import { describe, expect, it } from 'vitest';
import { AssetCatalogSchema } from '@vtt/core';
import { prefabCatalog } from './baileywiki-catalog.ts';

const ref = (p: string) => `pack://baileywiki/media/modules/baileywiki-maps/${p}`;
const tile = (src: string, w: number, h: number, extra: object = {}) => ({
  id: 't',
  kind: 'image' as const,
  x: 0,
  y: 0,
  w,
  h,
  src,
  ...extra,
});

describe('a catalog of the pieces Baileywiki’s prefabs place', () => {
  const catalog = prefabCatalog([
    {
      prefab: { name: 'Oak Tree', tags: ['nature', 'trees'], tiles: [tile(ref('trees/oak.webp'), 300, 300)] },
      grid: 150,
    },
    { prefab: { name: 'Oak Again', tiles: [tile(ref('trees/oak.webp'), 300, 300)] }, grid: 150 },
    {
      prefab: {
        name: 'Grass Ground',
        fill: true,
        tiles: [tile(ref('ground/a.webp'), 500, 500, { repeat: { src: ref('ground/grass.webp') } })],
      },
      grid: 100,
    },
    {
      prefab: {
        name: 'Barrel 3D',
        thumb: ref('thumbs/barrel.webp'),
        tiles: [tile(ref('blank.webp'), 100, 100, { model: { src: ref('models/barrel.glb'), height: 2.5 } })],
      },
      grid: 100,
    },
    { prefab: { name: 'Fire FX', tiles: [tile(ref('fx/fire.webm'), 100, 100)] }, grid: 100 },
    { prefab: { name: 'Elsewhere', tiles: [tile('pack://other/media/x.webp', 100, 100)] }, grid: 100 },
  ]);

  it('is a catalog the pack can carry', () => {
    expect(AssetCatalogSchema.safeParse(catalog).success).toBe(true);
  });

  it('has each picture once, at its size in feet, found by the prefab’s name and tags', () => {
    const oak = catalog.assets.filter((a) => a.src === 'media/modules/baileywiki-maps/trees/oak.webp');
    expect(oak).toEqual([
      expect.objectContaining({ id: 'oak', kind: 'tile', name: 'Oak Tree', w: 10, h: 10, overhead: true }),
    ]);
    expect(oak[0]!.tags).toEqual(expect.arrayContaining(['nature', 'trees', 'oak']));
  });

  it('makes repeating ground a texture and a model a model, with the prefab’s picture', () => {
    expect(catalog.assets.find((a) => a.kind === 'texture')).toMatchObject({
      src: 'media/modules/baileywiki-maps/ground/grass.webp',
      w: 25,
    });
    expect(catalog.assets.find((a) => a.kind === 'model')).toMatchObject({
      src: 'media/modules/baileywiki-maps/models/barrel.glb',
      w: 5,
      height: 2.5,
      thumb: 'media/modules/baileywiki-maps/thumbs/barrel.webp',
    });
  });

  it('leaves out videos and other packs’ files', () => {
    expect(catalog.assets.map((a) => a.name)).not.toContain('Fire FX');
    expect(catalog.assets.map((a) => a.name)).not.toContain('Elsewhere');
  });
});
