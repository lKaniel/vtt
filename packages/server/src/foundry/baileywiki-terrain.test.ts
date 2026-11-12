import { describe, expect, it } from 'vitest';
import { terrainPicker, withTerrain } from './baileywiki-terrain.ts';

// Baileywiki's Unlimited Terrain spawners all start on a cave floor; in
// Foundry the spawn opens a picker on the tileable folders, and the
// spawner's name says which. The import picks from the folder its name
// names.

const STREETS = 'modules/baileywiki-maps-premium-towns/maps/townsquare/misc2/2024-may-release/tileable-streets';
const have = [
  `${STREETS}/caves-and-mines/bw_terrain_cave_tileable_005.webp`,
  `${STREETS}/grassy-terrain/bw_grass_02_tileable.webp`,
  `${STREETS}/grassy-terrain/bw_grass_01_tileable.webp`,
  `${STREETS}/grassy-terrain/bw_grass_01_tileable_thumb.webp`,
  `${STREETS}/desolate-dirt-terrains/bw_dirt_01.webp`,
  `${STREETS}/snowy/bw_snow_01.webp`,
  'modules/baileywiki-maps/maps/docks.webp',
];

describe('the picture an Unlimited Terrain spawner repeats', () => {
  const pick = terrainPicker(have);

  it('is the first tileable picture of the folder its name names', () => {
    expect(pick('Unlimited Terrain Spawner - Grassland and Hills', `${STREETS}/caves-and-mines/x.webp`)).toBe(
      `${STREETS}/grassy-terrain/bw_grass_01_tileable.webp`,
    );
    expect(pick('Unlimited Terrain Spawner - Desolate Dirt', undefined)).toBe(
      `${STREETS}/desolate-dirt-terrains/bw_dirt_01.webp`,
    );
  });

  it('stays the spawner’s own when that is already in the folder its name names, or nothing matches', () => {
    expect(pick('Unlimited Terrain Spawner - Caves and Mines', `${STREETS}/caves-and-mines/x.webp`)).toBeUndefined();
    expect(pick('Unlimited Terrain Spawner - Lake Beach', `${STREETS}/x/y.webp`)).toBeUndefined();
    expect(pick('Street Lamp', undefined)).toBeUndefined();
  });
});

describe('a spawner prefab', () => {
  it('repeats the picture its name names, by the pack’s reference', () => {
    const ref = (p: string) => `pack://baileywiki/media/${p}`;
    const tile = { id: 't', kind: 'image' as const, x: 0, y: 0, w: 1, h: 1, src: ref('black.png') };
    const spawner = {
      name: 'Unlimited Terrain Spawner - Grassland and Hills',
      tiles: [
        { ...tile, repeat: { src: ref(`${STREETS}/caves-and-mines/bw_terrain_cave_tileable_005.webp`), scale: 2 } },
      ],
    };
    expect(withTerrain(spawner, terrainPicker(have), ref)?.tiles[0]).toMatchObject({
      repeat: { src: ref(`${STREETS}/grassy-terrain/bw_grass_01_tileable.webp`), scale: 2 },
    });
  });
});
