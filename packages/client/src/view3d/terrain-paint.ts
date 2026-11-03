import type { Terrain3D } from '@vtt/shared';
import * as THREE from 'three';
import { assetUrl } from '../assets.ts';

// How terrain is painted, as 3D Canvas's textureGradient shader paints it: up
// to four pictures, each tinted and repeated across the tile, laid in order
// over the ground where it stands high enough (its share of the height, or of
// flatness when `bySlope`), fading in over `blend`. The first shows only up
// to where the second starts.

const BASE = '#8a8a8a';
const loader = new THREE.TextureLoader();
const pictures = new Map<string, THREE.Texture>();
let blank: THREE.Texture | undefined;

/** A layer's picture, shared by every terrain that uses it; plain white for a colour alone. */
function pictureOf(src: string | undefined): THREE.Texture {
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

/** The fragment code laying the layers over the base colour. */
export function paintCode(count: number): string {
  const layers = Array.from(
    { length: count },
    (_, i) => `{
      vec4 t = texture2D(uLayer${i}, vTerrainUv * uRepeat[${i}]);
      t.rgb *= uColor[${i}];
      paint = mix(paint, t, t.a * ${shareOf(i)});
    }`,
  ).join('\n');
  return `#include <map_fragment>
    float p = vTerrainRise;
    vec4 paint = vec4(1.0);
    ${layers}
    diffuseColor.rgb *= paint.rgb;`;
}

/** Terrain's material: lit, its base colour, the layers painted over it. */
export function terrainMaterial(terrain: Terrain3D): THREE.MeshStandardMaterial {
  const layers = terrain.layers ?? [];
  // Under painted layers the ground is white, so the pictures keep their own colours.
  const color = terrain.color ?? (layers.length ? '#ffffff' : BASE);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
  if (!layers.length) return material;
  // The first layer runs up to where the second starts (to the top when it is alone).
  const from = [0, 1, 2, 3].map((i) => layers[i]?.from ?? 1);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFrom = { value: from };
    shader.uniforms.uBlend = { value: terrain.blend ?? 0.1 };
    shader.uniforms.uRepeat = { value: [0, 1, 2, 3].map((i) => layers[i]?.repeat ?? 1) };
    shader.uniforms.uColor = { value: [0, 1, 2, 3].map((i) => new THREE.Color(layers[i]?.color ?? '#ffffff')) };
    layers.forEach((l, i) => (shader.uniforms[`uLayer${i}`] = { value: pictureOf(l.src) }));
    const rise = terrain.bySlope ? 'max(0.0, normal.y)' : 'clamp(rise, 0.0, 1.0)';
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float rise;\nvarying float vTerrainRise;\nvarying vec2 vTerrainUv;',
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvTerrainRise = ${rise};\nvTerrainUv = uv;`);
    const samplers = layers.map((_, i) => `uniform sampler2D uLayer${i};`).join('\n');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uFrom[4];\nuniform float uBlend;\nuniform float uRepeat[4];\nuniform vec3 uColor[4];\n${samplers}\nvarying float vTerrainRise;\nvarying vec2 vTerrainUv;`,
      )
      .replace('#include <map_fragment>', paintCode(layers.length));
  };
  material.customProgramCacheKey = () => `terrain:${layers.length}:${terrain.bySlope ? 1 : 0}`;
  return material;
}
