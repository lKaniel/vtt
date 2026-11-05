import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ghostly, Instances, solidAgain } from './instances3d.ts';

// Many copies of one model are drawn together, one draw call per piece of it
// in each part of the map, while each copy keeps its own meshes, unseen, for
// the clicks, what creatures stand on and the look inside.

const template = () => {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
  const lid = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  lid.position.y = 2;
  root.add(body, lid);
  return root;
};

/** A copy of `t` standing at x, z, ready to be drawn (its meshes unseen). */
const copyAt = (t: THREE.Object3D, x: number, z: number) => {
  const c = t.clone();
  c.position.set(x, 0, z);
  c.updateMatrixWorld(true);
  ghostly(c);
  return { object: c, variant: 'chest' };
};

const meshesOf = (g: THREE.Object3D) =>
  g.children.filter((o): o is THREE.InstancedMesh => o instanceof THREE.InstancedMesh);

describe('copies drawn together', () => {
  it('draws each piece of all the copies in one instanced mesh', () => {
    const t = template();
    const all = new Instances(10000);
    all.draw([copyAt(t, 0, 0), copyAt(t, 100, 0), copyAt(t, 200, 0)]);
    const drawn = meshesOf(all.group);
    expect(drawn).toHaveLength(2);
    expect(drawn.map((m) => m.count)).toEqual([3, 3]);
    const m = new THREE.Matrix4();
    drawn[1]!.getMatrixAt(2, m);
    expect(new THREE.Vector3().setFromMatrixPosition(m).toArray()).toEqual([200, 2, 0]);
  });

  it('keeps each copy for clicks but draws none of it on its own', () => {
    const t = template();
    const copy = copyAt(t, 0, 0);
    const body = copy.object.children[0] as THREE.Mesh;
    expect((body.material as THREE.Material).visible).toBe(false);
    expect((body.material as THREE.Material).side).toBe(THREE.DoubleSide);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObject(copy.object, true).length).toBeGreaterThan(0);
    solidAgain(copy.object);
    expect((body.material as THREE.Material).visible).toBe(true);
  });

  it('is never hit itself, so a click meets each copy once', () => {
    const t = template();
    const all = new Instances(10000);
    all.draw([copyAt(t, 0, 0)]);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObject(all.group, true)).toEqual([]);
  });

  it('draws copies far apart in separate meshes, so the camera skips the parts out of view', () => {
    const t = template();
    const all = new Instances(1000);
    all.draw([copyAt(t, 0, 0), copyAt(t, 5000, 0)]);
    expect(meshesOf(all.group)).toHaveLength(4);
  });

  it('draws again with fewer copies, and none left over', () => {
    const t = template();
    const all = new Instances(10000);
    all.draw([copyAt(t, 0, 0), copyAt(t, 100, 0)]);
    all.draw([copyAt(t, 0, 0)]);
    expect(meshesOf(all.group).map((m) => m.count)).toEqual([1, 1]);
    all.draw([]);
    expect(meshesOf(all.group)).toHaveLength(0);
  });
});
