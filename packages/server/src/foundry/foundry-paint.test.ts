import { describe, expect, it } from 'vitest';
import { paintOf } from './foundry-paint.ts';
import { scene3dOf, tileModelOf } from './foundry-3d.ts';
import { tileTerrainOf } from './foundry-terrain.ts';

// 3D Canvas's colorswap and overlay shaders become `paint` (shared
// paint3d.ts) on models and terrain; its fog becomes the scene's.

const find = (path: string) => (path.startsWith('modules/') ? `/assets/foundry/${path}` : undefined);
const grid = { size: 100, distance: 5 };
const off = { sourceColor2: '#ff0000', targetColor2: '#0000ff', threshold2: 0 };
const swap = { enabled: true, sourceColor1: '#dcd7cb', targetColor1: '#413016', threshold1: 1, ...off };
const leaves = {
  enabled: true,
  textureDiffuse: 'modules/c3d/ScatteredLeaves007_Color.webp',
  color: '#eea949',
  strength: 0.75,
  coveragePercent: 1,
  inclination: 1,
  repeat: 12,
  black_alpha: true,
  add_blend: false,
  mult_blend: false,
};

describe('3D Canvas paint', () => {
  it('keeps the colour swaps that are on, in order', () => {
    expect(paintOf({ shaders: { colorswap: swap } }, find)).toEqual({
      swaps: [{ from: '#dcd7cb', to: '#413016', within: 1 }],
    });
    expect(paintOf({ shaders: { colorswap: { ...swap, enabled: false } } }, find)).toBeUndefined();
    expect(paintOf({ shaders: { colorswap: { ...swap, threshold1: 0 } } }, find)).toBeUndefined();
  });

  it('keeps an overlay whose picture came along, as it blends', () => {
    expect(paintOf({ shaders: { overlay: leaves } }, find)?.overlay).toEqual({
      src: '/assets/foundry/modules/c3d/ScatteredLeaves007_Color.webp',
      color: '#eea949',
      strength: 0.75,
      repeat: 12,
      slope: 1,
      blackClear: true,
    });
    const added = paintOf({ shaders: { overlay: { ...leaves, add_blend: true, coveragePercent: -0.61 } } }, find);
    expect(added?.overlay).toMatchObject({ blend: 'add', cover: -0.61 });
    expect(paintOf({ shaders: { overlay: { ...leaves, textureDiffuse: 'gone.webp' } } }, find)).toBeUndefined();
    expect(paintOf({ shaders: { overlay: { ...leaves, strength: 0 } } }, find)).toBeUndefined();
  });

  it('paints models and terrain', () => {
    const flags = (f: object) => ({ flags: { 'levels-3d-preview': f } });
    const rock = tileModelOf(
      flags({ model3d: 'modules/rock.glb', depth: 100, shaders: { colorswap: swap } }),
      grid,
      find,
    );
    expect(rock?.paint?.swaps).toHaveLength(1);
    const hills = flags({
      dynaMesh: 'box',
      displacementMap: 'modules/h.webp',
      depth: 100,
      shaders: { colorswap: swap, overlay: leaves },
    });
    expect(Object.keys(tileTerrainOf(hills, grid, find)?.paint ?? {})).toEqual(['swaps', 'overlay']);
  });

  it("brings the scene's fog, which 3D Canvas also shows as its sky", () => {
    const scene = (f: object) => ({ flags: { 'levels-3d-preview': f } });
    expect(scene3dOf(scene({ enableFog: true, fogColor: '#d9d0b4', fogDistance: 8000 }), find)?.fog).toEqual({
      color: '#d9d0b4',
      distance: 8000,
    });
    expect(scene3dOf(scene({ enableFog: true, fogColor: '#d9d0b4' }), find)?.fog).toEqual({
      color: '#d9d0b4',
      distance: 3000,
    });
    expect(scene3dOf(scene({ enableFog: false, fogColor: '#d9d0b4' }), find)).toBeUndefined();
  });
});
