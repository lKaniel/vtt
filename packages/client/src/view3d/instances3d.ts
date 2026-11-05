import * as THREE from 'three';

// Many copies of one model drawn together (models3d.ts): every piece (mesh)
// of the model is one InstancedMesh holding all its copies in one part of the
// map, so a thousand floor tiles cost a few draw calls instead of a thousand,
// and the camera still skips the parts of the map out of view. Each copy keeps
// its own meshes in the scene for clicks, what creatures stand on and the look
// inside (inside3d.ts), but those draw nothing: their materials are unseen
// stand-ins (`ghostly`) that rays still meet.

/** A copy to draw: its object (made `ghostly`) and what it is a copy of (same variant = same meshes and materials). */
export interface Copy {
  object: THREE.Object3D;
  variant: string;
}

const standIns = new Map<THREE.Side, THREE.Material>();

/** An unseen material that rays meet as they would `m` (same sides). */
function standInFor(m: THREE.Material): THREE.Material {
  let s = standIns.get(m.side);
  if (!s) {
    s = new THREE.MeshBasicMaterial({ visible: false, side: m.side });
    standIns.set(m.side, s);
  }
  return s;
}

/** The meshes of `o`, in a fixed order (copies of one model list theirs alike). */
function meshesOf(o: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  o.traverse((c) => {
    if (c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh)) out.push(c as THREE.Mesh);
  });
  return out;
}

/** Stops `o` drawing itself (it is drawn with its fellow copies) while rays still meet it. */
export function ghostly(o: THREE.Object3D): void {
  for (const mesh of meshesOf(o)) {
    if (mesh.userData.real) continue;
    mesh.userData.real = mesh.material;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(standInFor) : standInFor(mesh.material);
  }
}

/** Lets `o` draw itself again (lit on its own while the pointer is on it). */
export function solidAgain(o: THREE.Object3D): void {
  for (const mesh of meshesOf(o)) {
    const real = mesh.userData.real as THREE.Mesh['material'] | undefined;
    if (!real) continue;
    mesh.material = real;
    delete mesh.userData.real;
  }
}

const noHit = () => undefined;
const at = new THREE.Vector3();

/** The copies drawn together, by variant and part of the map. */
export class Instances {
  readonly group = new THREE.Group();
  private drawn = new Map<string, THREE.InstancedMesh[]>();
  /** Which copies each batch holds, so a batch whose copies did not change is left alone. */
  private holds = new Map<string, string>();

  /** `cell`: the side of the parts of the map copies are drawn by, pixels. */
  constructor(private readonly cell: number) {}

  /**
   * Draws exactly these copies (their world matrices must be up to date).
   * Only batches whose copies changed are filled again, unless `moved`: the
   * copies themselves moved (stood again on another floor, say).
   */
  draw(copies: readonly Copy[], moved = false): void {
    const byKey = new Map<string, THREE.Object3D[]>();
    for (const c of copies) {
      at.setFromMatrixPosition(c.object.matrixWorld);
      const key = `${c.variant}|${Math.floor(at.x / this.cell)},${Math.floor(at.z / this.cell)}`;
      const list = byKey.get(key) ?? [];
      list.push(c.object);
      byKey.set(key, list);
    }
    for (const [key, meshes] of this.drawn) {
      if (byKey.has(key)) continue;
      this.drop(meshes);
      this.drawn.delete(key);
      this.holds.delete(key);
    }
    for (const [key, objects] of byKey) {
      const holds = objects.map((o) => o.id).join();
      if (!moved && this.holds.get(key) === holds) continue;
      this.holds.set(key, holds);
      this.drawn.set(key, this.fill(this.drawn.get(key), objects));
    }
  }

  /** The instanced meshes for one batch of copies, reused while they hold enough. */
  private fill(had: THREE.InstancedMesh[] | undefined, objects: THREE.Object3D[]): THREE.InstancedMesh[] {
    const parts = objects.map(meshesOf);
    const first = parts[0]!;
    const fits = had?.length === first.length && had.every((m) => m.instanceMatrix.count >= objects.length);
    const meshes = fits ? had : this.make(first, objects.length, had);
    meshes.forEach((mesh, i) => {
      parts.forEach((p, j) => mesh.setMatrixAt(j, p[i]!.matrixWorld));
      mesh.count = objects.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
    return meshes;
  }

  private make(pieces: THREE.Mesh[], count: number, had: THREE.InstancedMesh[] | undefined): THREE.InstancedMesh[] {
    if (had) this.drop(had);
    const room = 2 ** Math.ceil(Math.log2(Math.max(1, count)));
    return pieces.map((p) => {
      const material = (p.userData.real as THREE.Mesh['material'] | undefined) ?? p.material;
      const mesh = new THREE.InstancedMesh(p.geometry, material, room);
      // The copies' own meshes take the hits.
      mesh.raycast = noHit;
      this.group.add(mesh);
      return mesh;
    });
  }

  private drop(meshes: THREE.InstancedMesh[]): void {
    for (const m of meshes) {
      this.group.remove(m);
      m.dispose();
    }
  }
}
