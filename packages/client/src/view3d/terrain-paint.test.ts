import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { paintCode, paintUniforms, terrainMaterial } from './terrain-paint.ts';

// Terrain paint: 3D Canvas's textureGradient, layer by layer.

describe('terrain paint', () => {
  it('lays each layer in order, the first only up to where the second starts', () => {
    const code = paintCode(3);
    expect(code.match(/texture2D\(uLayer\d/g)).toEqual(['texture2D(uLayer0', 'texture2D(uLayer1', 'texture2D(uLayer2']);
    expect(code).toContain('step(uFrom[0], p) * step(p, uFrom[1] + uBlend)');
    expect(code).toContain('clamp((p - (uFrom[2] - uBlend))');
  });

  it('is plain grey without layers, white under them', () => {
    expect(terrainMaterial({ heightmap: '/h.webp', height: 5 }).color.getHexString()).toBe('8a8a8a');
    const painted = terrainMaterial({ heightmap: '/h.webp', height: 5, layers: [{ from: 0, color: '#ff0000' }] });
    expect(painted.color.getHexString()).toBe('ffffff');
    expect(painted.customProgramCacheKey()).toBe('terrain:1:0');
  });

  it('paints the mask picture last, where its mask is white', () => {
    const code = paintCode(2, true);
    expect(code).toContain('texture2D(uMask, vTerrainUv).r');
    expect(code.indexOf('uMaskPicture')).toBeGreaterThan(code.indexOf('uLayer1'));
    expect(paintCode(2)).not.toContain('uMask');
    const mask = { map: '/m.jpg', src: '/g.webp', color: '#a88948', repeat: 10 };
    const masked = terrainMaterial({ heightmap: '/h.webp', height: 5, mask });
    expect(masked.color.getHexString()).toBe('ffffff');
    expect(masked.customProgramCacheKey()).toBe('terrain:0:0:mask');
  });

  it('hands the shader where each layer starts, how often it repeats and its tint', () => {
    const u = paintUniforms({
      heightmap: '/h.webp',
      height: 5,
      blend: 0.2,
      layers: [{ from: 0 }, { from: 0.7, repeat: 4, color: '#ff0000' }],
    });
    expect(u.uFrom!.value).toEqual([0, 0.7, 1, 1]);
    expect(u.uRepeat!.value).toEqual([1, 4, 1, 1]);
    expect((u.uColor!.value as THREE.Color[])[1]!.getHexString()).toBe('ff0000');
    expect(u.uBlend!.value).toBeCloseTo(0.2);
    expect(u.uLayer1).toBeDefined();
    expect(u.uMask).toBeUndefined();
  });
});
