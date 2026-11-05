import type { TileDoor } from '@vtt/shared';
import * as THREE from 'three';
import { loadModel, modelLoader } from './model-loader.ts';
import { at3d } from './scene3d.ts';
import type { DoorBox } from './walls3d.ts';

// Doors in 3D, as in BG3. A plain door (a wall with `door`) hangs a wooden
// leaf on its hinge that swings open and shut. A door model (a tile with
// `door`: a door, a chest, a secret wall, a drawbridge, from 3D Canvas)
// swings, slides, lifts, fades or plays its own animation as its door wall
// opens. Both move over time, from where they are, whenever the door changes.

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** How far each door has opened, 0 (shut) to 1 (open), moving over its time when it changes. */
export class DoorClock {
  private doors = new Map<string, { open: boolean; from: number; at: number }>();

  at(key: string, open: boolean, ms: number, now: number): number {
    const was = this.doors.get(key);
    if (!was) {
      this.doors.set(key, { open, from: open ? 1 : 0, at: -Infinity });
      return open ? 1 : 0;
    }
    if (was.open !== open) this.doors.set(key, { open, from: this.progress(was, ms, now), at: now });
    return this.progress(this.doors.get(key)!, ms, now);
  }

  private progress(d: { open: boolean; from: number; at: number }, ms: number, now: number): number {
    const goal = d.open ? 1 : 0;
    const left = Math.abs(goal - d.from);
    const t = left ? clamp01((now - d.at) / (ms * left)) : 1;
    return d.from + (goal - d.from) * easeInOut(t);
  }
}

/** How a door model stands `p` of the way open: turned, moved (its own units), how opaque, how far through its animation. */
export interface Pose {
  turn: number;
  shift: [number, number, number];
  opacity: number;
  clip: number;
}

/** A door model's pose `p` of the way open; `size` is the model's own size. */
export function poseOf(look: TileDoor, p: number, size: readonly [number, number, number]): Pose {
  const pose: Pose = { turn: 0, shift: [0, 0, 0], opacity: 1, clip: look.style === 'rewind' ? 1 - p : p };
  const angle = ((look.angle ?? 90) * Math.PI) / 180;
  const share = ((look.slide ?? 50) / 100) * p;
  if (look.style === 'swing') pose.turn = angle * p;
  if (look.style === 'slide') {
    const reach = Math.max(size[0], size[2]) * share;
    pose.shift = [Math.cos(angle) * reach, 0, Math.sin(angle) * reach];
  }
  if (look.style === 'lift') pose.shift = [0, size[1] * share, 0];
  if (look.style === 'fade') pose.opacity = 1 - 0.6 * p;
  return pose;
}

/** How long a leaf takes to swing, ms. */
const SWING_MS = 450;
/** A leaf's thickness, pixels. */
const LEAF = 7;

/** The leaves of plain doors: a wooden board on its hinge, swinging a quarter turn open. */
export class Leaves {
  readonly group = new THREE.Group();
  private clock = new DoorClock();
  private leaves = new Map<string, THREE.Group>();
  private geometry = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0);
  private wood = new THREE.MeshStandardMaterial({ color: 0x7a4e26, roughness: 0.8 });
  private iron = new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 0.5, metalness: 0.6 });

  /** Hangs exactly these doors on the floor at height `floor`, each as far open as it has swung by `now`. */
  show(doors: readonly DoorBox[], floor: number, now: number): void {
    const keep = new Set(doors.map((d) => d.id));
    for (const [id, leaf] of this.leaves) {
      if (keep.has(id)) continue;
      this.group.remove(leaf);
      this.leaves.delete(id);
    }
    for (const d of doors) this.hang(d, floor, now);
  }

  dispose(): void {
    this.geometry.dispose();
    this.wood.dispose();
    this.iron.dispose();
  }

  private hang(d: DoorBox, floor: number, now: number): void {
    const leaf = this.leaves.get(d.id) ?? this.make(d.id);
    leaf.position.copy(at3d(d.a, floor + d.bottom));
    leaf.scale.set(d.length, d.height, 1);
    const p = this.clock.at(d.id, d.open, SWING_MS, now);
    // Swings toward the map's south side of the wall (its right, walking from a to b).
    leaf.rotation.y = -d.angle - (Math.PI / 2) * p;
  }

  private make(id: string): THREE.Group {
    const leaf = new THREE.Group();
    const board = new THREE.Mesh(this.geometry, this.wood);
    board.scale.set(1, 1, LEAF);
    // Two iron bands across it.
    for (const y of [0.22, 0.75]) {
      const band = new THREE.Mesh(this.geometry, this.iron);
      band.scale.set(1, 0.05, LEAF + 2);
      band.position.y = y;
      leaf.add(band);
    }
    leaf.add(board);
    leaf.userData.door = id;
    this.leaves.set(id, leaf);
    this.group.add(leaf);
    return leaf;
  }
}

/** A door model to move: its model's key (a tile's "tile:<id>"), how it moves, and whether its wall is open. */
export interface ModelDoor {
  key: string;
  look: TileDoor;
  open: boolean;
}

/** What a copy of a door model keeps: where it stood shut, its size and what moves it. */
interface Rest {
  rotY: number;
  position: THREE.Vector3;
  size: [number, number, number];
  materials?: THREE.Material[];
  mixer?: THREE.AnimationMixer;
  actions?: THREE.AnimationAction[];
}

const clips = new Map<string, Promise<THREE.AnimationClip[]>>();
const loader = modelLoader();

/** A model file's animations (loaded once). */
function clipsOf(src: string): Promise<THREE.AnimationClip[]> {
  let found = clips.get(src);
  if (!found) {
    found = loadModel(loader, src).then((g) => g?.animations ?? []);
    clips.set(src, found);
  }
  return found;
}

/** Moves the copies of door models as their walls open and shut. */
export class ModelDoors {
  private clock = new DoorClock();
  private clipsFor = new Map<string, THREE.AnimationClip[]>();

  /** Poses each door model's copies (`copiesOf` a key: the model's pivots, each holding the model). */
  update(
    doors: readonly ModelDoor[],
    copiesOf: (key: string) => readonly THREE.Object3D[],
    now: number,
    src?: (key: string) => string | undefined,
  ): void {
    for (const d of doors) {
      const animated = d.look.style === 'play' || d.look.style === 'rewind';
      const found = animated ? this.clipsOfDoor(d.key, src?.(d.key)) : undefined;
      const ms = found?.[0] ? found[0].duration * 1000 : (d.look.ms ?? 400);
      const p = this.clock.at(d.key, d.open, ms, now);
      for (const pivot of copiesOf(d.key)) this.pose(pivot, d.look, p, found);
    }
  }

  /** A door's animations, once its file's have loaded. */
  private clipsOfDoor(key: string, src: string | undefined): THREE.AnimationClip[] | undefined {
    const known = this.clipsFor.get(key);
    if (known || !src) return known;
    this.clipsFor.set(key, []);
    void clipsOf(src).then((c) => this.clipsFor.set(key, c));
    return [];
  }

  private pose(pivot: THREE.Object3D, look: TileDoor, p: number, animations: THREE.AnimationClip[] | undefined): void {
    const model = pivot.children[0];
    if (!model) return;
    const rest = restOf(model);
    const pose = poseOf(look, p, rest.size);
    model.rotation.y = rest.rotY + pose.turn;
    model.position.copy(rest.position).add(new THREE.Vector3(...pose.shift));
    if (look.style === 'fade') fade(model, rest, pose.opacity);
    if (animations?.length) play(model, rest, animations, pose.clip);
  }
}

/** Where a copy stood shut and its size in its own units, noted the first time it moves. */
function restOf(model: THREE.Object3D): Rest {
  const known = model.userData.doorRest as Rest | undefined;
  if (known) return known;
  const bare = model.clone();
  bare.position.set(0, 0, 0);
  bare.rotation.set(0, 0, 0);
  bare.scale.set(1, 1, 1);
  bare.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(bare).getSize(new THREE.Vector3());
  const rest: Rest = { rotY: model.rotation.y, position: model.position.clone(), size: [size.x, size.y, size.z] };
  model.userData.doorRest = rest;
  return rest;
}

/** Fades a copy (on its own copies of its materials, so other copies keep theirs). */
function fade(model: THREE.Object3D, rest: Rest, opacity: number): void {
  if (!rest.materials) {
    rest.materials = [];
    model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const own = (m: THREE.Material) => {
        const copy = m.clone();
        rest.materials!.push(copy);
        return copy;
      };
      o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material as THREE.Material);
    });
  }
  for (const m of rest.materials) {
    m.transparent = opacity < 1;
    m.opacity = opacity;
    m.depthWrite = opacity >= 1;
  }
}

/** Holds a copy's animations `share` of the way through. */
function play(model: THREE.Object3D, rest: Rest, animations: THREE.AnimationClip[], share: number): void {
  if (!rest.mixer) {
    rest.mixer = new THREE.AnimationMixer(model);
    rest.actions = animations.map((clip) => {
      const action = rest.mixer!.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      action.paused = true;
      return action;
    });
  }
  for (const a of rest.actions!) a.time = a.getClip().duration * share;
  rest.mixer.update(0);
}
