import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { overlayCode, overlayUniforms, paintedMaterial, rawColor, swapUniforms } from './paint3d.ts';

// 3D Canvas's colour swaps and overlay, as the 3D view paints them.

describe('3D Canvas paint in the 3D view', () => {
  it('uses colours as 3D Canvas does: channels as they are, not turned from sRGB', () => {
    expect(rawColor('#808080').r).toBeCloseTo(128 / 255);
    expect(rawColor(undefined).r).toBe(1);
    expect(rawColor('red').g).toBe(1);
  });

  it('hands over three swaps, the ones not given never matching', () => {
    const u = swapUniforms({ swaps: [{ from: '#dcd7cb', to: '#413016', within: 1 }] });
    expect(u.uSwapWithin!.value).toEqual([1, 0, 0]);
    expect((u.uSwapTo!.value as THREE.Color[])[0]!.r).toBeCloseTo(0x41 / 255);
  });

  it('lays the overlay over, adds it or multiplies it in, and clears its black when asked', () => {
    const leaves = { src: '/l.webp', strength: 0.75 };
    expect(overlayCode(leaves, 'h', 'n', 'uv')).toContain('mix(diffuseColor.rgb, t.rgb');
    expect(overlayCode({ ...leaves, blend: 'add' }, 'h', 'n', 'uv')).toContain('diffuseColor.rgb += t.rgb');
    expect(overlayCode({ ...leaves, blend: 'multiply' }, 'h', 'n', 'uv')).toContain('diffuseColor.rgb *= t.rgb');
    expect(overlayCode({ ...leaves, blackClear: true }, 'h', 'n', 'uv')).toContain('t.rgb == vec3(0.0)');
    const u = overlayUniforms({ ...leaves, cover: -0.5 }, new THREE.Texture());
    expect([u.uOverlayCover!.value, u.uOverlaySlope!.value, u.uOverlayRepeat!.value]).toEqual([-0.5, 0, 1]);
  });
});

describe('painted model materials', () => {
  const shader = () => ({
    uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <map_fragment>',
  });

  it('copies the material and swaps its colours after it reads its picture', () => {
    const own = new THREE.MeshStandardMaterial();
    const paint = { swaps: [{ from: '#dcd7cb', to: '#413016', within: 1 }] };
    const m = paintedMaterial(own, paint, [0, 2], () => new THREE.Texture());
    expect(m).not.toBe(own);
    const s = shader();
    m.onBeforeCompile(s as never, undefined as never);
    expect(s.fragmentShader.indexOf('uSwapWithin[i]')).toBeGreaterThan(s.fragmentShader.indexOf('<map_fragment>'));
    expect(s.fragmentShader).not.toContain('uOverlay;');
    expect(s.uniforms.uPaintSpan!.value).toBe(2);
  });

  it('lays an overlay by its height up the model, where the model has a picture', () => {
    const paint = { overlay: { src: '/moss.webp', strength: 0.2, blend: 'add' as const } };
    const m = paintedMaterial(new THREE.MeshStandardMaterial(), paint, [1, 4], () => new THREE.Texture());
    const s = shader();
    m.onBeforeCompile(s as never, undefined as never);
    expect(s.vertexShader).toContain('vPaintHeight = clamp((position.y - uPaintBottom) / uPaintSpan');
    expect(s.fragmentShader).toContain('#ifdef USE_MAP');
    expect(m.customProgramCacheKey()).toContain('add');
  });
});
