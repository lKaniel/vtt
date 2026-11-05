import type { Point, Rect } from '@vtt/shared';
import * as THREE from 'three';
import type { Paint, Shape, Sketch } from '../canvas/sketch.ts';

// What the 3D view draws for the pointer and the previews, as in BG3: a ring
// on the surface under the pointer, the path a walk takes laid over what it
// crosses (stairs, floors, terrain), its end ring, the attack and spell lines
// and areas, and a marker where a walk goes until the creature gets there.
// The flat map draws the same previews (PathPreview.ts, as a Sketch), but its
// picture lies on the street, out of sight upstairs or under a floor. Marks
// draw over everything, so a path behind a wall still shows.

/** The height of what lies under a map point, three's y, for a walker whose feet are at `from` (undefined: where it stands now). */
export type HeightAt = (x: number, y: number, from?: number) => number;

/**
 * Map points every `step` pixels along `points`, each at the height under it
 * for a walker coming from the one before (so a path climbs stairs step by
 * step and stays off the tables and walls it passes): [x, y up, z].
 */
export function drape(points: readonly Point[], step: number, heightAt: HeightAt): [number, number, number][] {
  const out: [number, number, number][] = [];
  const add = (x: number, y: number) => out.push([x, heightAt(x, y, out.at(-1)?.[1]), y]);
  points.forEach((p, i) => {
    const prev = points[i - 1];
    if (prev) {
      const length = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      const n = Math.floor(length / step);
      for (let k = 1; k < n; k++) {
        const t = (k * step) / length;
        add(prev[0] + (p[0] - prev[0]) * t, prev[1] + (p[1] - prev[1]) * t);
      }
      if (n >= 1 && Math.abs(n * step - length) > 1e-6)
        add(prev[0] + ((p[0] - prev[0]) * n * step) / length, prev[1] + ((p[1] - prev[1]) * n * step) / length);
    }
    add(p[0], p[1]);
  });
  return out.filter((q, i) => i === 0 || q[0] !== out[i - 1]![0] || q[2] !== out[i - 1]![2]);
}

/** How far over the surface marks float, pixels. */
const LIFT = 3;
const OVER = 900;

/** A material that draws over everything, see-through by `paint`. */
function overlay(paint: Paint): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: paint.color,
    transparent: true,
    opacity: paint.alpha,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** A flat band along `steps` (three's axes), `width` across. */
function ribbon(steps: readonly [number, number, number][], width: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const half = width / 2;
  for (let i = 1; i < steps.length; i++) {
    const [a, b] = [steps[i - 1]!, steps[i]!];
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
    const [nx, nz] = [(-(b[2] - a[2]) / len) * half, ((b[0] - a[0]) / len) * half];
    const quad = [
      [a[0] + nx, a[1], a[2] + nz],
      [a[0] - nx, a[1], a[2] - nz],
      [b[0] + nx, b[1], b[2] + nz],
      [b[0] - nx, b[1], b[2] - nz],
    ];
    for (const k of [0, 1, 2, 2, 1, 3]) pos.push(quad[k]![0]!, quad[k]![1]! + LIFT, quad[k]![2]!);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** A ring (or a disc, for no width) lying flat, `r` out. */
function flatRing(r: number, width: number | undefined): THREE.BufferGeometry {
  const g = width
    ? new THREE.RingGeometry(Math.max(0, r - width / 2), r + width / 2, 48)
    : new THREE.CircleGeometry(r, 48);
  return g.rotateX(-Math.PI / 2);
}

/** The width a line of the flat map gets in 3D: thicker, as it is seen at a slant. */
const widthOf = (w: number, grid: number) => Math.max(w * 1.5, grid * 0.08);

interface Sizes {
  grid: number;
  heightAt: HeightAt;
}

/** The meshes for one shape of a preview. */
function meshesOf(shape: Shape, sizes: Sizes): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const { grid, heightAt } = sizes;
  if (shape.kind === 'line' && shape.stroke) {
    const steps = drape(shape.points, grid / 4, heightAt);
    out.push(new THREE.Mesh(ribbon(steps, widthOf(shape.stroke.width, grid)), overlay(shape.stroke)));
  } else if (shape.kind === 'circle') {
    const at = new THREE.Vector3(shape.at[0], heightAt(...shape.at) + LIFT, shape.at[1]);
    if (shape.fill) out.push(new THREE.Mesh(flatRing(shape.r, undefined), overlay(shape.fill)));
    if (shape.stroke)
      out.push(new THREE.Mesh(flatRing(shape.r, widthOf(shape.stroke.width, grid)), overlay(shape.stroke)));
    for (const m of out) m.position.copy(at);
  } else if (shape.kind === 'poly') out.push(...polyMeshes(shape, sizes));
  return out;
}

/** An area: filled flat at the height under its middle, its edge laid over what it crosses. */
function polyMeshes(shape: Extract<Shape, { kind: 'poly' }>, { grid, heightAt }: Sizes): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const mid = shape.points.reduce(
    (m, p) => [m[0] + p[0] / shape.points.length, m[1] + p[1] / shape.points.length],
    [0, 0],
  );
  if (shape.fill) {
    const outline = new THREE.Shape(shape.points.map(([x, y]) => new THREE.Vector2(x, -y)));
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(outline).rotateX(-Math.PI / 2), overlay(shape.fill));
    mesh.position.y = heightAt(mid[0], mid[1]) + LIFT;
    out.push(mesh);
  }
  if (shape.stroke) {
    const closed = [...shape.points, shape.points[0]!];
    out.push(
      new THREE.Mesh(
        ribbon(drape(closed, grid / 4, heightAt), widthOf(shape.stroke.width, grid)),
        overlay(shape.stroke),
      ),
    );
  }
  return out;
}

/** Where the pointer is: a point on a surface and its way up. */
export interface Spot {
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

/** Disposes of a group's meshes and empties it. */
function disposeAll(group: THREE.Group): void {
  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
  group.clear();
}

const MARQUEE_FILL = { color: 0xffd27a, alpha: 0.15 };
const MARQUEE_EDGE = { color: 0xffd27a, alpha: 0.9 };
const CURSOR = { color: 0xffffff, alpha: 0.85 };
const GOING = { color: 0x7fd0ff, alpha: 0.9 };
/** A walk's marker stays this many seconds at most, and goes once the creature is this close (squares). */
const MARKER = { seconds: 12, near: 0.25 };

export class Marks3D {
  readonly group = new THREE.Group();
  /** The ring under the pointer. */
  readonly cursorMesh = new THREE.Mesh(flatRing(1, 0.18), overlay(CURSOR));
  /** Where a walk goes. */
  readonly destination = new THREE.Group();
  private shapes = new THREE.Group();
  private box = new THREE.Group();
  private boxSeen = '';
  private seen = -1;
  private going?: { at: Point; left: number; grid: number };
  private age = 0;

  constructor() {
    this.cursorMesh.visible = false;
    this.destination.visible = false;
    const ring = new THREE.Mesh(flatRing(1, 0.22), overlay(GOING));
    const dot = new THREE.Mesh(flatRing(0.25, undefined), overlay(GOING));
    this.destination.add(ring, dot);
    for (const o of [this.cursorMesh, this.destination, this.shapes]) o.renderOrder = OVER;
    this.group.add(this.shapes, this.box, this.cursorMesh, this.destination);
    this.group.renderOrder = OVER;
  }

  /** Draws the preview the flat map drew (when it changed, or `again`). */
  preview(sketch: Sketch, sizes: Sizes, again = false): void {
    if (sketch.version === this.seen && !again) return;
    this.seen = sketch.version;
    disposeAll(this.shapes);
    for (const shape of sketch.shapes) for (const mesh of meshesOf(shape, sizes)) this.shapes.add(mesh);
    for (const mesh of this.shapes.children) mesh.renderOrder = OVER + 1;
  }

  /** The marquee being dragged, laid over what it covers; none for none. */
  marquee(rect: Rect | undefined, sizes: Sizes): void {
    const key = rect ? `${rect.x},${rect.y},${rect.w},${rect.h}` : '';
    if (key === this.boxSeen) return;
    this.boxSeen = key;
    disposeAll(this.box);
    if (!rect) return;
    const { x, y, w, h } = rect;
    const corners: Point[] = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
    const shape: Shape = { kind: 'poly', points: corners, fill: MARQUEE_FILL, stroke: { width: 3, ...MARQUEE_EDGE } };
    for (const mesh of polyMeshes(shape, sizes)) this.box.add(mesh);
    for (const mesh of this.box.children) mesh.renderOrder = OVER + 1;
  }

  /** Whether a marquee shows. */
  get marqueeShown(): boolean {
    return this.box.children.length > 0;
  }

  /** How many meshes the preview takes now. */
  get shapeCount(): number {
    return this.shapes.children.length;
  }

  /** The ring under the pointer, lying on the surface there; none off the map or over a creature. */
  cursor(spot: Spot | undefined, grid: number): void {
    this.cursorMesh.visible = !!spot;
    if (!spot) return;
    const r = grid * 0.28;
    this.cursorMesh.position.copy(spot.point).addScaledVector(spot.normal, LIFT);
    this.cursorMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), spot.normal);
    this.cursorMesh.scale.setScalar(r);
  }

  /** A walk set off for `to` (three's axes). */
  goingTo(to: THREE.Vector3, grid: number): void {
    this.going = { at: [to.x, to.z], left: MARKER.seconds, grid };
    this.destination.position.copy(to).setY(to.y + LIFT);
    this.destination.scale.setScalar(grid * 0.35);
    this.destination.visible = true;
    this.age = 0;
  }

  /** Pulses the walk's marker, gone once the walker (`at`) is there. */
  tick(dt: number, at: Point | undefined): void {
    const g = this.going;
    if (!g) return;
    g.left -= dt;
    this.age += dt;
    const there = at && Math.hypot(at[0] - g.at[0], at[1] - g.at[1]) < MARKER.near * g.grid;
    if (there || g.left <= 0) {
      this.going = undefined;
      this.destination.visible = false;
      return;
    }
    this.destination.scale.setScalar(g.grid * 0.35 * (1 + 0.12 * Math.sin(this.age * 6)));
  }

  dispose(): void {
    disposeAll(this.shapes);
    disposeAll(this.box);
    for (const o of [this.cursorMesh, ...this.destination.children]) {
      const mesh = o as THREE.Mesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}
