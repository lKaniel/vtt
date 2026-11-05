import type { Point } from '@vtt/shared';
import * as THREE from 'three';
import { type Footprint, insideOf } from './inside3d.ts';

// Seeing in, as in BG3: while the creature you act with is inside a building
// (inside3d.ts), that building's roof and upper floors over its head, and
// its walls between it and the camera (above their foot), are not drawn, so
// you see it and the room; outside, every building shows whole, and the
// houses next door always do. Not drawing is a discard in the shader, which
// needs no sorting of see-through meshes.

/** What is not drawn, in the 3D view's pixels (y up). */
export interface Peek {
  /** The creature's spot on the map. */
  at: Point;
  /** Over this height (its head), the building is not drawn. */
  head: number;
  /** Its walls between it and the camera go above this height (their foot). */
  low: number;
  /** The building it is in, on the map. */
  box: Footprint;
  /** Towards the camera on the map, a unit vector. */
  toward: Point;
}

/** The inputs every see-through shader shares, moved by `peekAt`. */
export const PEEK = {
  /** The building's corners: min x, min z, max x, max z. */
  uPeekBox: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** x, z of the creature, and 1 while it is inside (0 outside). */
  uPeekAt: { value: new THREE.Vector3(0, 0, 0) },
  /** Its head's height, the walls' foot, and the way to the camera (x, z). */
  uPeekCut: { value: new THREE.Vector4(0, 0, 0, 1) },
};

/** Sees into the building round `peek`, or nothing when the creature is outside. */
export function peekAt(peek: Peek | undefined): void {
  if (!peek) {
    PEEK.uPeekAt.value.z = 0;
    return;
  }
  PEEK.uPeekBox.value.set(peek.box.min[0], peek.box.min[1], peek.box.max[0], peek.box.max[1]);
  PEEK.uPeekAt.value.set(peek.at[0], peek.at[1], 1);
  PEEK.uPeekCut.value.set(peek.head, peek.low, peek.toward[0], peek.toward[1]);
}

/** Whether the point [x, y up, z] is not drawn (clicks go through it to what is behind). */
export function hides(peek: Peek | undefined, [x, y, z]: readonly [number, number, number]): boolean {
  if (!peek) return false;
  const { min, max } = peek.box;
  if (x < min[0] || x > max[0] || z < min[1] || z > max[1]) return false;
  const front = (x - peek.at[0]) * peek.toward[0] + (z - peek.at[1]) * peek.toward[1] > 0;
  return y > peek.head || (front && y > peek.low);
}

const DECLARATIONS = 'uniform vec4 uPeekBox;\nuniform vec3 uPeekAt;\nuniform vec4 uPeekCut;\nvarying vec3 vPeekWorld;';

const FADE = `#include <clipping_planes_fragment>
  if (uPeekAt.z > 0.5) {
    vec2 p = vPeekWorld.xz;
    bool inBox = all(greaterThanEqual(p, uPeekBox.xy)) && all(lessThanEqual(p, uPeekBox.zw));
    bool front = dot(p - uPeekAt.xy, uPeekCut.zw) > 0.0 && vPeekWorld.y > uPeekCut.y;
    if (inBox && (vPeekWorld.y > uPeekCut.x || front)) discard;
  }`;

const patched = new WeakSet<THREE.Material>();

/** Lets `material` fade round your creature, after whatever it already does to its shader. */
export function peekable(material: THREE.Material): THREE.Material {
  if (patched.has(material)) return material;
  patched.add(material);
  const before = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    Object.assign(shader.uniforms, PEEK);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPeekWorld;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvPeekWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DECLARATIONS}`)
      .replace('#include <clipping_planes_fragment>', FADE);
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}:peek`;
  return material;
}

/** The creature you act with: where it stands and its feet's height, pixels. */
export interface Stander {
  id: string;
  at: Point;
  feet: number;
}

/** Sizes, in pixels: a foot, a square. */
interface Scale {
  px: number;
  grid: number;
}

const HEAD_FEET = 7;
const FOOT_FEET = 2;
/** While it walks, how often to look again, ms. */
const LOOK_EVERY_MS = 250;

/** Works out, as your creature moves, whether it is inside and so what is not drawn. */
export class SeeIn {
  /** The building seen into now, undefined while outside. */
  peek?: Peek;
  private spot = '';
  private box?: Footprint;
  private lookedAt = -Infinity;

  constructor(private readonly roofs: () => THREE.Object3D[]) {}

  /** What `who` sees into with the camera turned `yaw`; nothing for no creature. */
  update(who: Stander | undefined, yaw: number, scale: Scale): void {
    const spot = who ? `${who.id}:${Math.round(who.at[0])},${Math.round(who.at[1])},${Math.round(who.feet)}` : '';
    const now = performance.now();
    if (spot !== this.spot && now - this.lookedAt >= LOOK_EVERY_MS) {
      this.spot = spot;
      this.lookedAt = now;
      this.box = who && insideOf(this.roofs(), who, scale);
    }
    this.peek =
      who && this.box
        ? {
            at: who.at,
            head: who.feet + HEAD_FEET * scale.px,
            low: who.feet + FOOT_FEET * scale.px,
            box: this.box,
            toward: [Math.sin(yaw), Math.cos(yaw)],
          }
        : undefined;
    peekAt(this.peek);
  }

  /** Looks again for the building (the models or boxes changed). */
  forget(): void {
    this.spot = '';
    this.lookedAt = -Infinity;
  }
}
