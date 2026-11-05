import type { Point } from '@vtt/shared';
import * as THREE from 'three';

// Whether the creature you act with is inside a building (or a cave), and
// how far that building goes, for the BG3 look inside (peek3d.ts). Inside
// means a roof over its head, walls round it on (nearly) every side, and
// those walls under that roof: under the eaves beside a wall, or under a
// tree, it is still outside. The building's extent is how far the roof goes
// on from over its head, walked square by square, so only that building fades
// and not its neighbours.

/** The building round your creature, on the map: x and y of two corners. */
export interface Footprint {
  min: Point;
  max: Point;
}

/** Your creature: where it stands and its feet's height, pixels. */
interface Who {
  at: Point;
  feet: number;
}

/** Sizes, in pixels: a foot, a square. */
interface Scale {
  px: number;
  grid: number;
}

/** How far over its head a roof counts, feet; its head; its waist, where it looks for walls. */
const ROOF_REACH_FEET = 40;
const HEAD_FEET = 7;
const WAIST_FEET = 3;
/** How far round it a building may go, squares. */
const MOST_SQUARES = 12;
/** How many of the eight ways round it must meet a wall under the roof. */
const WALLED_SIDES = 5;

const UP = new THREE.Vector3(0, 1, 0);
const caster = new THREE.Raycaster();

/** The building `who` is inside, among `meshes`; undefined when it is outside. */
export function insideOf(meshes: readonly THREE.Object3D[], who: Who, { px, grid }: Scale): Footprint | undefined {
  const head = who.feet + HEAD_FEET * px;
  const near = meshesNear(meshes, who.at, MOST_SQUARES * grid);
  const roofed = (p: Point) => roofOver(near, p, head, ROOF_REACH_FEET * px);
  if (!roofed(who.at)) return undefined;
  const roof = roofFrom(who.at, roofed, grid, MOST_SQUARES * grid);
  const box = { min: roof.min, max: roof.max };
  return walledIn(near, [who.at[0], who.feet + WAIST_FEET * px, who.at[1]], box) ? box : undefined;
}

/** The meshes whose bounds come within `reach` of `at` on the map. */
function meshesNear(objects: readonly THREE.Object3D[], at: Point, reach: number): THREE.Object3D[] {
  const area = new THREE.Box3(new THREE.Vector3(at[0] - reach, -Infinity, at[1] - reach));
  area.max.set(at[0] + reach, Infinity, at[1] + reach);
  const out: THREE.Object3D[] = [];
  const bounds = new THREE.Box3();
  const visit = (o: THREE.Object3D): void => {
    // Creatures' figures are not buildings.
    if (!o.visible || o.userData.figure) return;
    if (o instanceof THREE.Mesh && bounds.setFromObject(o).intersectsBox(area)) out.push(o);
    for (const c of o.children) visit(c);
  };
  for (const o of objects) visit(o);
  return out;
}

/** Whether something of `meshes` is over the spot, within `reach` pixels above `head`. */
function roofOver(meshes: readonly THREE.Object3D[], at: Point, head: number, reach: number): boolean {
  caster.set(new THREE.Vector3(at[0], head, at[1]), UP);
  caster.far = reach;
  return caster.intersectObjects(meshes as THREE.Object3D[], false).length > 0;
}

/** How far the roof over `at` goes on, walked in steps of `step` up to `reach` away. */
function roofFrom(at: Point, roofed: (p: Point) => boolean, step: number, reach: number): Footprint {
  const min: Point = [at[0], at[1]];
  const max: Point = [at[0], at[1]];
  const seen = new Set<string>(['0,0']);
  const todo: [number, number][] = [[0, 0]];
  const most = Math.floor(reach / step);
  for (let next = todo.pop(); next; next = todo.pop()) {
    const [i, j] = next;
    const p: Point = [at[0] + i * step, at[1] + j * step];
    if ((i || j) && !roofed(p)) continue;
    min[0] = Math.min(min[0], p[0] - step / 2);
    min[1] = Math.min(min[1], p[1] - step / 2);
    max[0] = Math.max(max[0], p[0] + step / 2);
    max[1] = Math.max(max[1], p[1] + step / 2);
    for (const [di, dj] of SIDES) {
      const k = `${i + di},${j + dj}`;
      if (Math.abs(i + di) > most || Math.abs(j + dj) > most || seen.has(k)) continue;
      seen.add(k);
      todo.push([i + di, j + dj]);
    }
  }
  return { min, max };
}

const SIDES: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Whether walls stand round `from` ([x, height, y]) on most sides, inside `box`. */
function walledIn(meshes: THREE.Object3D[], from: [number, number, number], box: Footprint): boolean {
  let walled = 0;
  for (let k = 0; k < 8; k++) {
    const way = new THREE.Vector3(Math.cos((k * Math.PI) / 4), 0, Math.sin((k * Math.PI) / 4));
    caster.set(new THREE.Vector3(...from), way);
    caster.far = toEdge([from[0], from[2]], [way.x, way.z], box);
    if (caster.intersectObjects(meshes, false).length) walled++;
  }
  return walled >= WALLED_SIDES;
}

/** How far from `p` along `way` the edge of `box` is. */
function toEdge(p: Point, way: Point, box: Footprint): number {
  let far = Infinity;
  for (const axis of [0, 1]) {
    const w = way[axis]!;
    if (Math.abs(w) < 1e-9) continue;
    const edge = w > 0 ? box.max[axis]! : box.min[axis]!;
    far = Math.min(far, (edge - p[axis]!) / w);
  }
  return Math.max(0, far);
}
