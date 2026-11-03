import { type Model3D, type ModelGround, modelPieces } from '@vtt/shared';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneRigged } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { at3d } from './scene3d.ts';

// The glTF models of the 3D view: on tiles (model3d.ts in shared says where
// each copy goes) and as creatures' figures. Each file loads once; every
// copy is a clone sharing its meshes.

/** A model to show over a rect of the map (a tile, or a creature's square). */
export interface ModelShown {
  /** Names the model and its file: the same key keeps its copies, moved to the new rect. */
  key: string;
  rect: { x: number; y: number; w: number; h: number };
  model: Model3D;
}

interface Loaded {
  scene: THREE.Group;
  size: [number, number, number];
  /** Moves the model so its middle is over the origin and its base on it. */
  offset: THREE.Vector3;
}

const loader = new GLTFLoader();
const files = new Map<string, Promise<Loaded | undefined>>();

function load(src: string): Promise<Loaded | undefined> {
  let file = files.get(src);
  if (!file) {
    file = loader.loadAsync(src).then(
      (gltf) => {
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        return {
          scene: gltf.scene,
          size: [size.x, size.y, size.z],
          offset: new THREE.Vector3(-centre.x, -box.min.y, -centre.z),
        };
      },
      () => undefined,
    );
    files.set(src, file);
  }
  return file;
}

const tinted = (scene: THREE.Object3D, color: string) =>
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mesh = o as THREE.Mesh;
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
      const copy = m.clone();
      if (copy instanceof THREE.MeshStandardMaterial) copy.color.multiply(new THREE.Color(color));
      return copy;
    });
    mesh.material = mats.length === 1 ? mats[0]! : mats;
  });

/** The copies of one model over one rect. */
class Placed {
  readonly group = new THREE.Group();
  private loaded?: Loaded;

  constructor(public shown: ModelShown) {}

  /** Loads its file, then calls `ready`. */
  async load(ready: () => void): Promise<void> {
    this.loaded = await load(this.shown.model.src);
    ready();
  }

  /** Stands the copies for the floor shown. */
  place(ground: ModelGround, floorPx: number): void {
    const l = this.loaded;
    if (!l) return;
    const pieces = modelPieces(this.shown.rect, this.shown.model, ground, l);
    while (this.group.children.length > pieces.length) this.group.remove(this.group.children.at(-1)!);
    pieces.forEach((p, i) => {
      const pivot = this.group.children[i] ?? this.copy(l);
      pivot.position.copy(at3d(p.at, floorPx + p.base));
      pivot.rotation.set(p.tilt[0], p.yaw, p.tilt[1], 'YXZ');
      pivot.scale.set(...p.scale);
    });
  }

  private copy(l: Loaded): THREE.Object3D {
    const pivot = new THREE.Group();
    // Rigged figures need their bones cloned with them, or they draw in pieces.
    const model = cloneRigged(l.scene);
    if (this.shown.model.color) tinted(model, this.shown.model.color);
    model.position.copy(l.offset);
    pivot.add(model);
    this.group.add(pivot);
    return pivot;
  }
}

/** The models standing in the 3D view. */
export class Models {
  readonly group = new THREE.Group();
  private placed = new Map<string, Placed>();
  private stale = true;

  /** Shows exactly these models; `ground` and `floorPx` say where the floor shown is. */
  show(all: readonly ModelShown[], ground: ModelGround, floorPx: number): void {
    const keep = new Set(all.map((m) => m.key));
    for (const [key, p] of this.placed) {
      if (keep.has(key)) continue;
      this.group.remove(p.group);
      this.placed.delete(key);
    }
    for (const shown of all) this.update(shown);
    if (!this.stale) return;
    this.stale = false;
    for (const p of this.placed.values()) p.place(ground, floorPx);
  }

  /** How many copies stand (the e2e tests read it off the 3D view). */
  get count(): number {
    let n = 0;
    for (const p of this.placed.values()) n += p.group.children.length;
    return n;
  }

  /** Marks the copies to be placed again (the floor shown changed, or something moved). */
  restand(): void {
    this.stale = true;
  }

  /** A new model is loaded; one that moved (a creature walking) is placed again. */
  private update(shown: ModelShown): void {
    const now = this.placed.get(shown.key);
    if (now) {
      if (!sameRect(now.shown.rect, shown.rect)) this.stale = true;
      now.shown = shown;
      return;
    }
    const p = new Placed(shown);
    void p.load(() => (this.stale = true));
    this.placed.set(shown.key, p);
    this.group.add(p.group);
    this.stale = true;
  }
}

const sameRect = (a: ModelShown['rect'], b: ModelShown['rect']) =>
  a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
