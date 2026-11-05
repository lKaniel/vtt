import type { Point } from '@vtt/shared';
import * as THREE from 'three';
import { type Footprint, insideOf } from './inside3d.ts';

// Seeing your creature, as in BG3: whatever stands between it and the
// camera is not drawn, a tube from its chest to the eye, so a roof, an upper
// floor or a house in front never hides it, and everything else stays whole
// (the floors above and below, the houses next door). While it is inside a
// building (inside3d.ts), that building's side towards the camera is cut
// down too, so the room shows. Nothing at its feet or below is cut. Not
// drawing is a discard in the shader, which needs no sorting of see-through
// meshes.

/** What is not drawn, in the 3D view's pixels (three's axes: y up). */
export interface Peek {
  /** The creature's spot on the map. */
  at: Point;
  /** Nothing at or under this height is cut (the floor it stands on, what lies on it). */
  low: number;
  /** The tube's start, at its chest: x, y up, z. */
  chest: readonly [number, number, number];
  /** The camera: x, y up, z. */
  eye: readonly [number, number, number];
  /** The tube's radius. */
  radius: number;
  /** The building it is in, and the way to the camera on the map (a unit vector); none outside. */
  room?: { box: Footprint; toward: Point };
}

/** The inputs every see-through shader shares, moved by `peekAt`. */
export const PEEK = {
  /** x, z of the creature, the height nothing under is cut, 1 while on. */
  uPeekAt: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** The tube's start (x, y, z) and radius. */
  uPeekChest: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** The camera. */
  uPeekEye: { value: new THREE.Vector3(0, 0, 0) },
  /** The building's corners: min x, min z, max x, max z. */
  uPeekBox: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** The way to the camera (x, z), and 1 while inside a building. */
  uPeekRoom: { value: new THREE.Vector3(0, 0, 0) },
};

/** Cuts round `peek`, or nothing without one. */
export function peekAt(peek: Peek | undefined): void {
  if (!peek) {
    PEEK.uPeekAt.value.w = 0;
    return;
  }
  PEEK.uPeekAt.value.set(peek.at[0], peek.at[1], peek.low, 1);
  PEEK.uPeekChest.value.set(...peek.chest, peek.radius);
  PEEK.uPeekEye.value.set(...peek.eye);
  const room = peek.room;
  if (room) PEEK.uPeekBox.value.set(room.box.min[0], room.box.min[1], room.box.max[0], room.box.max[1]);
  PEEK.uPeekRoom.value.set(room?.toward[0] ?? 0, room?.toward[1] ?? 0, room ? 1 : 0);
}

type Vec3 = readonly [number, number, number];

/** Whether `p` lies in the tube from the chest towards the eye (not behind the creature). */
function inTube(peek: Peek, p: Vec3): boolean {
  const c = peek.chest;
  const d = [peek.eye[0] - c[0], peek.eye[1] - c[1], peek.eye[2] - c[2]];
  const v = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const t = (v[0]! * d[0]! + v[1]! * d[1]! + v[2]! * d[2]!) / Math.max(1, d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2);
  if (t <= 0) return false;
  const k = Math.min(1, t);
  return Math.hypot(v[0]! - d[0]! * k, v[1]! - d[1]! * k, v[2]! - d[2]! * k) < peek.radius;
}

/** Whether `p` is in the building's half towards the camera. */
function inFront(peek: Peek, [x, , z]: Vec3): boolean {
  const room = peek.room;
  if (!room) return false;
  const { min, max } = room.box;
  if (x < min[0] || x > max[0] || z < min[1] || z > max[1]) return false;
  return (x - peek.at[0]) * room.toward[0] + (z - peek.at[1]) * room.toward[1] > 0;
}

/** Whether the point [x, y up, z] is not drawn (clicks go through it to what is behind). */
export function hides(peek: Peek | undefined, p: Vec3): boolean {
  if (!peek || p[1] <= peek.low) return false;
  return inTube(peek, p) || inFront(peek, p);
}

const DECLARATIONS =
  'uniform vec4 uPeekAt;\nuniform vec4 uPeekChest;\nuniform vec3 uPeekEye;\nuniform vec4 uPeekBox;\nuniform vec3 uPeekRoom;\nvarying vec3 vPeekWorld;';

const FADE = `#include <clipping_planes_fragment>
  if (uPeekAt.w > 0.5 && vPeekWorld.y > uPeekAt.z) {
    vec3 d = uPeekEye - uPeekChest.xyz;
    vec3 v = vPeekWorld - uPeekChest.xyz;
    float t = dot(v, d) / max(dot(d, d), 1.0);
    bool tube = t > 0.0 && length(v - d * min(t, 1.0)) < uPeekChest.w;
    vec2 p = vPeekWorld.xz;
    bool inBox = all(greaterThanEqual(p, uPeekBox.xy)) && all(lessThanEqual(p, uPeekBox.zw));
    bool front = uPeekRoom.z > 0.5 && inBox && dot(p - uPeekAt.xy, uPeekRoom.xy) > 0.0;
    if (tube || front) discard;
  }`;

const patched = new WeakSet<THREE.Material>();

/** Lets `material` be cut round your creature, after whatever it already does to its shader. */
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
  material.customProgramCacheKey = () => `${key()}:peek2`;
  return material;
}

/** The creature you act with: where it stands and its feet's height, pixels. */
export interface Stander {
  id: string;
  at: Point;
  feet: number;
}

/** Sizes, in pixels: a foot, a square; and the camera, three's axes. */
interface Scale {
  px: number;
  grid: number;
}

/** Its chest; what is cut stays above its knees. */
const CHEST_FEET = 4;
const KNEE_FEET = 2;
/** The tube's radius: this share of the camera's distance, within these many squares. */
const TUBE = { share: 0.14, least: 1.4, most: 5 };
/** While it walks, how often to look again for the building it is in, ms. */
const LOOK_EVERY_MS = 250;

/** Works out, as your creature moves, what is cut so you see it. */
export class SeeIn {
  /** What is cut now, undefined with no creature. */
  peek?: Peek;
  private spot = '';
  private box?: Footprint;
  private lookedAt = -Infinity;

  constructor(private readonly roofs: () => THREE.Object3D[]) {}

  /** What is cut for `who` seen from `eye` (three's axes); nothing for no creature. */
  update(who: Stander | undefined, eye: Vec3, scale: Scale): void {
    this.lookForRoom(who, scale);
    if (!who) {
      this.peek = undefined;
      peekAt(undefined);
      return;
    }
    const chest: Vec3 = [who.at[0], who.feet + CHEST_FEET * scale.px, who.at[1]];
    const far = Math.hypot(eye[0] - chest[0], eye[1] - chest[1], eye[2] - chest[2]);
    const radius = Math.min(TUBE.most * scale.grid, Math.max(TUBE.least * scale.grid, far * TUBE.share));
    const flat = Math.hypot(eye[0] - who.at[0], eye[2] - who.at[1]) || 1;
    const toward: Point = [(eye[0] - who.at[0]) / flat, (eye[2] - who.at[1]) / flat];
    this.peek = {
      at: who.at,
      low: who.feet + KNEE_FEET * scale.px,
      chest,
      eye,
      radius,
      ...(this.box && { room: { box: this.box, toward } }),
    };
    peekAt(this.peek);
  }

  /** Looks for the building round it when it moved (at most every LOOK_EVERY_MS while it walks). */
  private lookForRoom(who: Stander | undefined, scale: Scale): void {
    const spot = who ? `${who.id}:${Math.round(who.at[0])},${Math.round(who.at[1])},${Math.round(who.feet)}` : '';
    const now = performance.now();
    if (spot === this.spot || now - this.lookedAt < LOOK_EVERY_MS) return;
    this.spot = spot;
    this.lookedAt = now;
    this.box = who && insideOf(this.roofs(), who, scale);
  }

  /** Looks again for the building (the models or boxes changed). */
  forget(): void {
    this.spot = '';
    this.lookedAt = -Infinity;
  }
}
