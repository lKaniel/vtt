import type { Overlay, Paint3D } from '@vtt/shared';
import * as THREE from 'three';

// 3D Canvas's colour swaps and overlays (shared paint3d.ts) in GLSL, run
// right after a material reads its picture: swaps first, then the overlay,
// as 3D Canvas runs them. Its colours are used as they are (three.js r132,
// which 3D Canvas uses, did not turn them from sRGB), so `rawColor`.

/** A colour with its channels used as they are, as 3D Canvas's shaders use them. */
export function rawColor(hex: string | undefined, fallback = '#ffffff'): THREE.Color {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? fallback) ?? /^#?([0-9a-f]{6})$/i.exec(fallback)!;
  const n = parseInt(m[1]!, 16);
  return new THREE.Color().setRGB(
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
    THREE.LinearSRGBColorSpace,
  );
}

export const SWAP_DECLARATIONS = 'uniform vec3 uSwapFrom[3];\nuniform vec3 uSwapTo[3];\nuniform float uSwapWithin[3];';

/** The swaps' uniforms: unused ones never match. */
export function swapUniforms(paint: Paint3D | undefined): Record<string, THREE.IUniform> {
  const swaps = paint?.swaps ?? [];
  const at = (i: number) => swaps[i];
  return {
    uSwapFrom: { value: [0, 1, 2].map((i) => rawColor(at(i)?.from)) },
    uSwapTo: { value: [0, 1, 2].map((i) => rawColor(at(i)?.to)) },
    uSwapWithin: { value: [0, 1, 2].map((i) => at(i)?.within ?? 0) },
  };
}

/** The first swap within reach repaints the spot: its brightness times the new colour. */
export const SWAP_CODE = `{
      vec3 c = diffuseColor.rgb;
      float gray = 0.21 * c.r + 0.71 * c.g + 0.07 * c.b;
      for (int i = 0; i < 3; i++) {
        if (uSwapWithin[i] > 0.0 && distance(c, uSwapFrom[i]) < uSwapWithin[i] * 1.732) {
          diffuseColor.rgb = gray * uSwapTo[i];
          break;
        }
      }
    }`;

export const OVERLAY_DECLARATIONS =
  'uniform sampler2D uOverlay;\nuniform vec3 uOverlayColor;\nuniform float uOverlayStrength;\nuniform float uOverlayRepeat;\nuniform float uOverlayCover;\nuniform float uOverlaySlope;';

export function overlayUniforms(o: Overlay, picture: THREE.Texture): Record<string, THREE.IUniform> {
  return {
    uOverlay: { value: picture },
    uOverlayColor: { value: rawColor(o.color) },
    uOverlayStrength: { value: o.strength },
    uOverlayRepeat: { value: o.repeat ?? 1 },
    uOverlayCover: { value: o.cover ?? 1 },
    uOverlaySlope: { value: o.slope ?? 0 },
  };
}

const BLENDS: Record<NonNullable<Overlay['blend']> | 'over', string> = {
  over: 'diffuseColor.rgb = mix(diffuseColor.rgb, t.rgb, s * t.a);',
  add: 'diffuseColor.rgb += t.rgb * s;',
  multiply: 'diffuseColor.rgb *= t.rgb * s;',
};

/**
 * The overlay over a spot `height` (0–1) up the shape, its surface facing
 * `up` (the normal's y) at picture place `uv`: 3D Canvas's overlay shader.
 */
export function overlayCode(o: Overlay, height: string, up: string, uv: string): string {
  const clear = o.blackClear
    ? 'float k = (t.r + t.g + t.b) / 3.0; if (k > 0.1) k *= 3.0; s *= clamp(k, 0.0, 1.0); if (t.rgb == vec3(0.0)) s = 0.0;'
    : '';
  return `{
      float h = ${height};
      float cover = uOverlayCover;
      float s = uOverlayStrength;
      float past = cover > 0.0 ? h - cover : (1.0 - h) + cover;
      if (past > 0.05) s = 0.0;
      else if (past > 0.0) s *= 1.0 - past * 20.0;
      float n = max(0.0, ${up});
      float slope = uOverlaySlope;
      if (slope > 0.0 && n < slope) s *= clamp((n - (slope - 0.3)) / 0.3, 0.0, 1.0);
      if (slope < 0.0 && n > 1.0 + slope) s *= clamp(((1.0 + slope + 0.3) - n) / 0.3, 0.0, 1.0);
      vec4 t = texture2D(uOverlay, ${uv} * uOverlayRepeat);
      ${clear}
      t.rgb *= uOverlayColor;
      ${BLENDS[o.blend ?? 'over']}
    }`;
}

const MODEL_VARYINGS =
  'uniform float uPaintBottom;\nuniform float uPaintSpan;\nvarying float vPaintHeight;\nvarying float vPaintUp;';

/** A copy of a model's material painted as 3D Canvas paints it; `span` is the model's bottom and height in its own units. */
export function paintedMaterial(
  own: THREE.Material,
  paint: Paint3D,
  [bottom, span]: [number, number],
  picture: (src: string) => THREE.Texture,
): THREE.Material {
  const copy = own.clone();
  const { swaps, overlay } = paint;
  copy.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, swapUniforms(paint), {
      uPaintBottom: { value: bottom },
      uPaintSpan: { value: span > 0 ? span : 1 },
    });
    if (overlay) Object.assign(shader.uniforms, overlayUniforms(overlay, picture(overlay.src)));
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${MODEL_VARYINGS}`)
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvPaintHeight = clamp((position.y - uPaintBottom) / uPaintSpan, 0.0, 1.0);\nvPaintUp = normal.y;',
      );
    const declarations = [SWAP_DECLARATIONS, overlay ? OVERLAY_DECLARATIONS : '', MODEL_VARYINGS].join('\n');
    // 3D Canvas lays overlays only on meshes with a picture place (uv).
    const laid = overlay ? `#ifdef USE_MAP\n${overlayCode(overlay, 'vPaintHeight', 'vPaintUp', 'vMapUv')}\n#endif` : '';
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${declarations}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${swaps ? SWAP_CODE : ''}\n${laid}`);
  };
  const key = `${own.customProgramCacheKey()}:paint:${paintKey(paint)}`;
  copy.customProgramCacheKey = () => key;
  return copy;
}

/** What tells painted shaders apart: whether they swap, how their overlay blends, whether it clears black. */
export function paintKey(paint: Paint3D | undefined): string {
  const o = paint?.overlay;
  const blend = o ? (o.blend ?? 'over') : '';
  return [paint?.swaps ? 'swap' : '', blend, o?.blackClear ? 'clear' : ''].join('-');
}
