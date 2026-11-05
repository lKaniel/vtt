import type { Point } from '@vtt/shared';
import * as THREE from 'three';
import { isFigure } from './models3d.ts';
import type { MapPoint } from './orbit.ts';
import { hides, type Peek } from './peek3d.ts';
import { at3d } from './scene3d.ts';

// What the pointer is on in the 3D view: a creature's picture, else the
// first surface it meets (terrain, a model's floor, a box) that is drawn,
// else the floor shown. Pixi asks for every pointer event, sometimes twice,
// so the answer is kept for the rest of the frame.

/** What the picker needs of the 3D view. */
export interface PickScene {
  camera: THREE.Camera;
  canvas: HTMLElement;
  /** The creature whose picture the ray meets first. */
  creature(ray: THREE.Raycaster): string | undefined;
  placeOf(id: string): Point | undefined;
  /** What the pointer may land on. */
  surfaces(): THREE.Object3D[];
  peek(): Peek | undefined;
  /** The floor shown's height, three's y. */
  floor(): number;
  target(): MapPoint;
}

/** What the pointer is on. */
export interface Picked {
  /** The map point. */
  at: Point;
  /** Where, three's axes (x, y up, z). */
  point: THREE.Vector3;
  /** The surface's way up there (world axes). */
  normal: THREE.Vector3;
  /** The creature, when it is on one. */
  creature?: string;
}

const UP = new THREE.Vector3(0, 1, 0);

export class Picker {
  /** The left button is down: a drag (a creature carried, a marquee) looks through creatures to the ground. */
  held = false;
  private ray = new THREE.Raycaster();
  private kept?: { x: number; y: number; frame: number; picked: Picked };

  constructor(private readonly scene: PickScene) {}

  /** What is under the pointer at these client coordinates in frame `frame`. */
  pick(clientX: number, clientY: number, frame: number): Picked {
    const k = this.kept;
    if (k?.x === clientX && k.y === clientY && k.frame === frame) return k.picked;
    const picked = this.fresh(clientX, clientY);
    this.kept = { x: clientX, y: clientY, frame, picked };
    return picked;
  }

  private fresh(clientX: number, clientY: number): Picked {
    const s = this.scene;
    const rect = s.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
    this.ray.setFromCamera(ndc, s.camera);
    return this.onCreature() ?? this.onSurface() ?? this.onFloor();
  }

  private onCreature(): Picked | undefined {
    const id = this.held ? undefined : this.scene.creature(this.ray);
    const at = id ? this.scene.placeOf(id) : undefined;
    if (!id || !at) return undefined;
    return { at, point: at3d(at, this.scene.floor()), normal: UP.clone(), creature: id };
  }

  private onSurface(): Picked | undefined {
    const peek = this.scene.peek();
    const hit = this.ray.intersectObjects(this.scene.surfaces(), true).find((h) => pointable(h, peek, this.held));
    if (!hit) return undefined;
    const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : UP.clone();
    if (normal.dot(this.ray.ray.direction) > 0) normal.negate();
    return { at: [hit.point.x, hit.point.z], point: hit.point.clone(), normal };
  }

  private onFloor(): Picked {
    const floor = new THREE.Plane(UP, -this.scene.floor());
    const hit = this.ray.ray.intersectPlane(floor, new THREE.Vector3());
    if (hit) return { at: [hit.x, hit.z], point: hit, normal: UP.clone() };
    const t = this.scene.target();
    const far = at3d([t[0], t[1]], t[2]).add(this.ray.ray.direction.clone().setY(0).normalize().multiplyScalar(1e5));
    return { at: [far.x, far.z], point: far, normal: UP.clone() };
  }
}

/** What the pointer may land on: shown, not cut to see your creature, and no creature's figure while dragging. */
function pointable(hit: THREE.Intersection, peek: Peek | undefined, held: boolean): boolean {
  if (!hit.object.visible || hides(peek, hit.point.toArray())) return false;
  return !held || !isFigure(hit.object);
}
