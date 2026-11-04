import type { Point } from '@vtt/shared';
import * as THREE from 'three';

// Seeing in, as in BG3: while the creature you act with stands under a roof,
// the models and boxes round it go see-through over its head (the roof) and
// between it and the camera (the near walls, above their foot), so you see
// it and the room; outside, the buildings show whole. The fade is a screen
// door (a share of the pixels drawn), which needs no sorting of see-through
// meshes, and softens towards the edge of its reach.

/** Where the fade is, in the 3D view's pixels (y up). */
export interface Peek {
  /** The creature's spot on the map. */
  at: Point;
  /** Over this height (its head), things near it fade. */
  head: number;
  /** Things between it and the camera fade above this height (the walls' foot). */
  low: number;
  /** How far round it things fade, pixels. */
  radius: number;
  /** Towards the camera on the map, a unit vector. */
  toward: Point;
}

/** How much of a faded thing still shows. */
const SHOWN = 0.3;

/** The inputs every faded shader shares, moved by `peekAt`. */
export const PEEK = {
  /** x, z of the creature, the fade's reach, and 1 while it is inside (0 outside). */
  uPeek: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** Its head's height, the walls' foot, and the way to the camera (x, z). */
  uPeekCut: { value: new THREE.Vector4(0, 0, 0, 1) },
  uPeekShown: { value: SHOWN },
};

/** Fades round `peek`, or nothing when the creature is outside. */
export function peekAt(peek: Peek | undefined): void {
  if (!peek) {
    PEEK.uPeek.value.w = 0;
    return;
  }
  PEEK.uPeek.value.set(peek.at[0], peek.at[1], peek.radius, 1);
  PEEK.uPeekCut.value.set(peek.head, peek.low, peek.toward[0], peek.toward[1]);
}

/** Whether the point [x, y up, z] is faded (clicks go through it to what is behind). */
export function hides(peek: Peek | undefined, [x, y, z]: readonly [number, number, number]): boolean {
  if (!peek) return false;
  const off: Point = [x - peek.at[0], z - peek.at[1]];
  if (Math.hypot(...off) >= peek.radius) return false;
  const front = off[0] * peek.toward[0] + off[1] * peek.toward[1] > 0;
  return y > peek.head || (front && y > peek.low);
}

const UP = new THREE.Vector3(0, 1, 0);
const caster = new THREE.Raycaster();

/** Whether something of `objects` is over the spot within `reach` pixels above `head`: the creature is inside. */
export function roofOver(objects: THREE.Object3D[], at: Point, head: number, reach: number): boolean {
  caster.set(new THREE.Vector3(at[0], head, at[1]), UP);
  caster.far = reach;
  return caster.intersectObjects(objects, true).some((h) => h.object.visible);
}

const DECLARATIONS = 'uniform vec4 uPeek;\nuniform vec4 uPeekCut;\nuniform float uPeekShown;\nvarying vec3 vPeekWorld;';

// A fixed noise per screen pixel decides which of them a faded thing still draws.
const FADE = `#include <clipping_planes_fragment>
  if (uPeek.w > 0.5) {
    vec2 off = vPeekWorld.xz - uPeek.xy;
    float d = length(off);
    bool front = dot(off, uPeekCut.zw) > 0.0 && vPeekWorld.y > uPeekCut.y;
    if (d < uPeek.z && (vPeekWorld.y > uPeekCut.x || front)) {
      float shown = mix(uPeekShown, 1.0, smoothstep(0.75 * uPeek.z, uPeek.z, d));
      float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      if (noise > shown) discard;
    }
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

/** How far over its head a roof makes it inside, and how far round it things fade. */
const ROOF_REACH_FEET = 40;
const HEAD_FEET = 7;
const FOOT_FEET = 2;
const REACH_SQUARES = 5;

/** Works out, as your creature moves, whether it is inside and so what fades. */
export class SeeIn {
  /** The fade now, undefined while outside. */
  peek?: Peek;
  private spot = '';
  private inside = false;

  constructor(private readonly roofs: () => THREE.Object3D[]) {}

  /** The fade for `who` with the camera turned `yaw`; nothing for no creature. */
  update(who: Stander | undefined, yaw: number, { px, grid }: Scale): void {
    const head = who ? who.feet + HEAD_FEET * px : 0;
    const spot = who ? `${who.id}:${Math.round(who.at[0])},${Math.round(who.at[1])},${Math.round(who.feet)}` : '';
    if (spot !== this.spot) {
      this.spot = spot;
      this.inside = !!who && roofOver(this.roofs(), who.at, head, ROOF_REACH_FEET * px);
    }
    this.peek =
      who && this.inside
        ? {
            at: who.at,
            head,
            low: who.feet + FOOT_FEET * px,
            radius: REACH_SQUARES * grid,
            toward: [Math.sin(yaw), Math.cos(yaw)],
          }
        : undefined;
    peekAt(this.peek);
  }

  /** Looks again for a roof (the models or boxes changed). */
  forget(): void {
    this.spot = '';
  }
}
