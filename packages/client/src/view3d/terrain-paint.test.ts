import { describe, expect, it } from 'vitest';
import { paintCode, terrainMaterial } from './terrain-paint.ts';

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
});
