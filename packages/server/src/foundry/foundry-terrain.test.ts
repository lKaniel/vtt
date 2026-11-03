import { describe, expect, it } from 'vitest';
import { tileTerrainOf } from './foundry-terrain.ts';
import { foundryScene } from './foundry-scene.ts';

// 3D Canvas terrain: a box tile whose top a heightmap raises (its `depth` the
// highest peak, its textureGradient the rock, dirt and grass by height)
// becomes a tile with `terrain` (shared terrain3d.ts).

const find = (path: string) => (path.startsWith('modules/') ? `/assets/foundry/${path}` : undefined);
const grid = { size: 100, distance: 5 };
const hills = 'modules/canvas3dcompendium/assets/Terrain_heightmaps/Hills/Hills-1-1.webp';
const terrainFlags = (more: object = {}) => ({
  dynaMesh: 'box',
  displacementMap: hills,
  displacementMatrix: '0.18,0.25,4.6,4.6',
  invertDisplacementMap: true,
  depth: 1000,
  dynaMeshResolution: 2,
  autoGround: true,
  color: '#ffffff',
  shaders: {
    textureGradient: {
      enabled: true,
      texCount: 2,
      smoothing: 0.1275,
      useNormals: true,
      tex0Begin: 0,
      tex1Begin: 0.71,
      tex2Begin: 0.89,
      textureDiffuse0: 'modules/c3d/Rock012_Color.webp',
      color0: '#2e2e2e',
      repeat0: 5,
      textureDiffuse1: 'modules/c3d/Ground031_Color.webp',
      color1: '#ffffff',
      repeat1: 1,
      textureDiffuse2: 'modules/c3d/never-used.webp',
    },
  },
  ...more,
});
const tile = (f: object, more: object = {}) => ({
  elevation: 10,
  rotation: 90,
  flags: { 'levels-3d-preview': f },
  ...more,
});

describe('3D Canvas terrain', () => {
  it('keeps the heightmap, its window, the peak height and the painted layers', () => {
    expect(tileTerrainOf(tile(terrainFlags()), grid, find)).toEqual({
      heightmap: `/assets/foundry/${hills}`,
      window: [0.18, 0.25, 4.6, 4.6],
      highIsWhite: true,
      height: 50,
      elevation: 10,
      rotation: 90,
      detail: 2,
      layers: [
        { src: '/assets/foundry/modules/c3d/Rock012_Color.webp', color: '#2e2e2e', repeat: 5, from: 0 },
        { src: '/assets/foundry/modules/c3d/Ground031_Color.webp', from: 0.71 },
      ],
      blend: 0.1275,
      bySlope: true,
    });
  });

  it('stands an ungrounded one half its height lower, as 3D Canvas centres it', () => {
    expect(tileTerrainOf(tile(terrainFlags({ autoGround: false })), grid, find)?.elevation).toBe(-15);
  });

  it('builds the misnamed "mapGen" with no map data as the box it falls back to', () => {
    expect(tileTerrainOf(tile(terrainFlags({ dynaMesh: 'mapGen' })), grid, find)?.height).toBe(50);
    expect(tileTerrainOf(tile(terrainFlags({ dynaMesh: 'mapGen', mapgen: { rows: 1 } })), grid, find)).toBeUndefined();
  });

  it('is none without a heightmap that came along, or for another shape', () => {
    expect(tileTerrainOf(tile(terrainFlags({ displacementMap: 'gone/h.webp' })), grid, find)).toBeUndefined();
    expect(tileTerrainOf(tile(terrainFlags({ displacementMap: '' })), grid, find)).toBeUndefined();
    expect(tileTerrainOf(tile(terrainFlags({ dynaMesh: 'cylinder' })), grid, find)).toBeUndefined();
  });

  it('becomes a terrain tile on the scene, not a solid box', () => {
    const scene = {
      name: 'Hills',
      width: 1000,
      height: 1000,
      padding: 0,
      grid,
      tiles: [
        {
          // Terrain tiles often have no picture at all.
          texture: { src: null },
          x: 0,
          y: 0,
          width: 400,
          height: 300,
          flags: { 'levels-3d-preview': terrainFlags() },
        },
      ],
    };
    const media = (p: string) => find(p);
    const { scene: s } = foundryScene(scene, media);
    const t = s.tiles[0]!;
    expect(t).toMatchObject({ x: 0, y: 0, w: 400, h: 300, terrain: { height: 50 } });
    expect('solid' in t && t.solid).toBeFalsy();
  });
});
