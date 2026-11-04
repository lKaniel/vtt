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
      `#include <begin_vertex>\nvTerrainRise = ${rise};\nvTerrainHeight = clamp(rise, 0.0, 1.0);\nvTerrainUp = normal.y;\nvTerrainUv = uv;\nvDrapeXZ = (modelMatrix * vec4(transformed, 1.0)).xz;`,
    );
}

const VARYINGS =
  'varying float vTerrainRise;\nvarying float vTerrainHeight;\nvarying float vTerrainUp;\nvarying vec2 vTerrainUv;\nvarying vec2 vDrapeXZ;';

/**
 * The flat map's drawing (walk paths, selection rings, spell areas, fog of
 * war), which the 3D view lays on its floor (scene3d.ts Ground), draped over
 * terrain too, where it would hide under the hills: one set of inputs shared
 * by every terrain, moved each frame (`drapeOver`).
 */
export const DRAPE = {
  uDrape: { value: null as THREE.Texture | null },
  /** The square it covers: x, z of its corner, then its width and depth (pixels). */
  uDrapeRect: { value: new THREE.Vector4(0, 0, 1, 1) },
};

/** Lays the flat map's picture over terrain, over the square `half` pixels round `center`. */
export function drapeOver(picture: THREE.Texture, [x, y]: readonly [number, number], half: number): void {
  DRAPE.uDrape.value = picture;
  DRAPE.uDrapeRect.value.set(x - half, y - half, 2 * half, 2 * half);
}

const DRAPE_DECLARATIONS = 'uniform sampler2D uDrape;\nuniform vec4 uDrapeRect;';
/** Drawn over the lit ground, as the flat map drew it (its own light and fog). */
const DRAPE_CODE = `{
      vec2 d = (vDrapeXZ - uDrapeRect.xy) / uDrapeRect.zw;
      if (d.x >= 0.0 && d.x <= 1.0 && d.y >= 0.0 && d.y <= 1.0) {
        vec4 drawn = texture2D(uDrape, vec2(d.x, 1.0 - d.y));
        outgoingLight = mix(outgoingLight, drawn.rgb, drawn.a);
      }
    }
    #include <opaque_fragment>`;
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
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, paintUniforms(terrain), DRAPE);
    vertexCode(shader, !!terrain.bySlope);
    const declarations = [
      LAYER_UNIFORMS,
      ...layers.map((_, i) => `uniform sampler2D uLayer${i};`),
      SWAP_DECLARATIONS,
      paint?.overlay ? OVERLAY_DECLARATIONS : '',
      mask ? MASK_UNIFORMS : '',
      DRAPE_DECLARATIONS,
      VARYINGS,
    ].join('\n');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${declarations}`)
      .replace('#include <map_fragment>', paintCode(layers.length, { paint, mask: !!mask }))
      .replace('#include <opaque_fragment>', DRAPE_CODE);
  };
  material.customProgramCacheKey = () => terrainKey(terrain);
  return material;
}

/** Terrains whose shaders differ compile apart. */
function terrainKey(t: Terrain3D): string {
  return `terrain:${t.layers?.length ?? 0}:${t.bySlope ? 1 : 0}${t.mask ? ':mask' : ''}:${paintKey(t.paint)}`;
}
