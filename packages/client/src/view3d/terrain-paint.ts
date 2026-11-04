import type { Paint3D, Terrain3D } from '@vtt/shared';
import * as THREE from 'three';
import { assetUrl } from '../assets.ts';
import {
  OVERLAY_DECLARATIONS,
  overlayCode,
  overlayUniforms,
  paintKey,
  rawColor,
  SWAP_CODE,
  SWAP_DECLARATIONS,
  swapUniforms,
} from './paint3d.ts';

// How terrain is painted, as 3D Canvas's textureGradient shader paints it: up
// to four pictures, each tinted and repeated across the tile, laid in order
// over the ground where it stands high enough (its share of the height, or of
// flatness when `bySlope`), fading in over `blend`. The first shows only up
// to where the second starts. A `mask` paints one more picture on top
// wherever its mask picture is white (3D Canvas's mask shader: paths, mud).

const BASE = '#8a8a8a';
const loader = new THREE.TextureLoader();
const pictures = new Map<string, THREE.Texture>();
let blank: THREE.Texture | undefined;

/** A layer's picture, shared by every terrain and model that uses it; plain white for a colour alone. */
export function pictureOf(src: string | undefined): THREE.Texture {
  if (!src) {
    blank ??= whitePixel();
    return blank;
  }
  let t = pictures.get(src);
  if (!t) {
    t = loader.load(assetUrl(src));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    pictures.set(src, t);
  }
  return t;
}

function whitePixel(): THREE.Texture {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
}

/** One layer's share at height (or flatness) `p`, in GLSL. */
function shareOf(i: number): string {
  if (i === 0) return 'step(uFrom[0], p) * step(p, uFrom[1] + uBlend)';
  return `clamp((p - (uFrom[${i}] - uBlend)) / max(uBlend, 0.0001), 0.0, 1.0)`;
}

// 3D Canvas paints the mask's picture only on surfaces facing up.
const MASK = `if (vTerrainUp > 0.0) {
      vec4 t = texture2D(uMaskPicture, vTerrainUv * uMaskRepeat);
      t.rgb *= uMaskColor;
      diffuseColor.rgb = mix(diffuseColor.rgb, t.rgb, t.a * texture2D(uMask, vTerrainUv).r);
    }`;

/** What is painted after the layers, in 3D Canvas's order: swaps, overlay, mask. */
interface Extras {
  paint?: Paint3D;
  mask?: boolean;
}

/** The fragment code laying the layers over the base colour, then the swaps, the overlay and the masked picture. */
export function paintCode(count: number, extras: Extras = {}): string {
  const layers = Array.from(
    { length: count },
    (_, i) => `{
      vec4 t = texture2D(uLayer${i}, vTerrainUv * uRepeat[${i}]);
      t.rgb *= uColor[${i}];
      paint = mix(paint, t, t.a * ${shareOf(i)});
    }`,
  ).join('\n');
  const { paint, mask } = extras;
  return `#include <map_fragment>
    float p = vTerrainRise;
    vec4 paint = vec4(1.0);
    ${layers}
    diffuseColor.rgb *= paint.rgb;
    ${paint?.swaps ? SWAP_CODE : ''}
    ${paint?.overlay ? overlayCode(paint.overlay, 'vTerrainHeight', 'vTerrainUp', 'vTerrainUv') : ''}
    ${mask ? MASK : ''}`;
}

/** The shader's inputs: the layers' pictures, where each starts, and the mask's. */
export function paintUniforms(terrain: Terrain3D): Record<string, THREE.IUniform> {
  const layers = terrain.layers ?? [];
  // The first layer runs up to where the second starts (to the top when it is alone).
  const uniforms: Record<string, THREE.IUniform> = {
    uFrom: { value: [0, 1, 2, 3].map((i) => layers[i]?.from ?? 1) },
    uBlend: { value: terrain.blend ?? 0.1 },
    uRepeat: { value: [0, 1, 2, 3].map((i) => layers[i]?.repeat ?? 1) },
    uColor: { value: [0, 1, 2, 3].map((i) => rawColor(layers[i]?.color)) },
    ...swapUniforms(terrain.paint),
  };
  layers.forEach((l, i) => (uniforms[`uLayer${i}`] = { value: pictureOf(l.src) }));
  const overlay = terrain.paint?.overlay;
  if (overlay) Object.assign(uniforms, overlayUniforms(overlay, pictureOf(overlay.src)));
  return terrain.mask ? { ...uniforms, ...maskUniforms(terrain.mask) } : uniforms;
}

function maskUniforms(mask: NonNullable<Terrain3D['mask']>): Record<string, THREE.IUniform> {
  return {
    uMask: { value: pictureOf(mask.map) },
    uMaskPicture: { value: pictureOf(mask.src) },
    uMaskRepeat: { value: mask.repeat ?? 1 },
    uMaskColor: { value: rawColor(mask.color) },
  };
}

const MASK_UNIFORMS =
  'uniform sampler2D uMask;\nuniform sampler2D uMaskPicture;\nuniform float uMaskRepeat;\nuniform vec3 uMaskColor;';

/** The vertex code: how high each spot stands (or how flat), which way it faces, its picture place. */
function vertexCode(shader: { vertexShader: string }, bySlope: boolean): void {
  const rise = bySlope ? 'max(0.0, normal.y)' : 'clamp(rise, 0.0, 1.0)';
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\nattribute float rise;\n${VARYINGS}`)
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\nvTerrainRise = ${rise};\nvTerrainHeight = clamp(rise, 0.0, 1.0);\nvTerrainUp = normal.y;\nvTerrainUv = uv;`,
    );
}

const VARYINGS =
  'varying float vTerrainRise;\nvarying float vTerrainHeight;\nvarying float vTerrainUp;\nvarying vec2 vTerrainUv;';
const LAYER_UNIFORMS =
  'uniform float uFrom[4];\nuniform float uBlend;\nuniform float uRepeat[4];\nuniform vec3 uColor[4];';

/** Terrain's material: lit, its base colour, the layers painted over it, then the swaps, overlay and masked picture. */
export function terrainMaterial(terrain: Terrain3D): THREE.MeshStandardMaterial {
  const layers = terrain.layers ?? [];
  const { paint, mask } = terrain;
  const painted = layers.length > 0 || !!mask || !!paint;
  // Under painted layers the ground is white, so the pictures keep their own colours.
  const material = new THREE.MeshStandardMaterial({
    color: terrain.color ?? (painted ? '#ffffff' : BASE),
    roughness: 0.95,
  });
  if (!painted) return material;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, paintUniforms(terrain));
    vertexCode(shader, !!terrain.bySlope);
    const declarations = [
      LAYER_UNIFORMS,
      ...layers.map((_, i) => `uniform sampler2D uLayer${i};`),
      SWAP_DECLARATIONS,
      paint?.overlay ? OVERLAY_DECLARATIONS : '',
      mask ? MASK_UNIFORMS : '',
      VARYINGS,
    ].join('\n');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${declarations}`)
      .replace('#include <map_fragment>', paintCode(layers.length, { paint, mask: !!mask }));
  };
  material.customProgramCacheKey = () => terrainKey(terrain);
  return material;
}

/** Terrains whose shaders differ compile apart. */
function terrainKey(t: Terrain3D): string {
  return `terrain:${t.layers?.length ?? 0}:${t.bySlope ? 1 : 0}${t.mask ? ':mask' : ''}:${paintKey(t.paint)}`;
}
