import {
  BoxGeometry,
  BufferGeometry,
  DodecahedronGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  OctahedronGeometry,
  Quaternion,
  TetrahedronGeometry,
  Vector3,
} from 'three';
import type { ThrownDie } from './dice-throw.ts';

// The shapes of the dice dice-3d.ts throws: each face a geometry group (its
// material shows the face's number) with texture coordinates centred on the
// face, and the turn that lays a given face towards the camera.

export interface DieShape {
  geometry: BufferGeometry;
  /** Each face's outward normal, by face index (group materialIndex). */
  normals: Vector3[];
}

/** A triangle's three corners. */
type Tri = [Vector3, Vector3, Vector3];

function trianglesOf(geometry: BufferGeometry): Tri[] {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = flat.getAttribute('position');
  const out: Tri[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    out.push([0, 1, 2].map((k) => new Vector3().fromBufferAttribute(pos, i + k)) as Tri);
  }
  return out;
}

const normalOf = ([p0, p1, p2]: Tri) =>
  new Vector3().subVectors(p1, p0).cross(new Vector3().subVectors(p2, p0)).normalize();

/** The triangles of a convex solid gathered into its flat faces. */
function facesOf(tris: Tri[]): Tri[][] {
  const faces: { normal: Vector3; tris: Tri[] }[] = [];
  for (const t of tris) {
    const n = normalOf(t);
    const face = faces.find((f) => f.normal.dot(n) > 0.999);
    if (face) face.tris.push(t);
    else faces.push({ normal: n, tris: [t] });
  }
  return faces.map((f) => f.tris);
}

/** A pentagonal trapezohedron: the d10's ten kites, each two triangles. */
function d10Faces(): Tri[][] {
  const a = 0.105;
  const ring = Array.from({ length: 10 }, (_, i) => {
    const angle = (i * Math.PI) / 5;
    return new Vector3(Math.cos(angle), Math.sin(angle), i % 2 ? -a : a);
  });
  // The apex height that keeps each kite flat: where the plane of U0, L1, U2 meets the axis.
  const [u0, l1, u2] = [ring[0]!, ring[1]!, ring[2]!];
  const n = new Vector3().subVectors(l1, u0).cross(new Vector3().subVectors(u2, u0));
  const h = n.dot(u0) / n.z;
  const top = new Vector3(0, 0, h);
  const bottom = new Vector3(0, 0, -h);
  const at = (i: number) => ring[i % 10]!;
  const faces: Tri[][] = [];
  for (let k = 0; k < 5; k++) {
    const [u, l, u2b] = [at(2 * k), at(2 * k + 1), at(2 * k + 2)];
    faces.push([
      [top, u, l],
      [top, l, u2b],
    ]);
    const [l0, up, l2] = [at(2 * k + 1), at(2 * k + 2), at(2 * k + 3)];
    faces.push([
      [bottom, up, l0],
      [bottom, l2, up],
    ]);
  }
  return faces;
}

const SOLIDS: Record<Exclude<ThrownDie['sides'], 10>, () => BufferGeometry> = {
  4: () => new TetrahedronGeometry(1),
  6: () => new BoxGeometry(1.2, 1.2, 1.2),
  8: () => new OctahedronGeometry(1),
  12: () => new DodecahedronGeometry(1),
  20: () => new IcosahedronGeometry(1),
};

/** Texture coordinates for a face: centred on it, the face filling the unit square's inscribed circle. */
function faceUvs(tris: Tri[], normal: Vector3): number[] {
  const corners = tris.flat();
  const centre = corners.reduce((s, p) => s.add(p), new Vector3()).divideScalar(corners.length);
  const u = new Vector3().subVectors(corners[0]!, centre).normalize();
  const v = new Vector3().crossVectors(normal, u);
  const reach = Math.max(...corners.map((p) => p.distanceTo(centre))) * 2;
  return corners.flatMap((p) => {
    const d = new Vector3().subVectors(p, centre);
    return [0.5 + d.dot(u) / reach, 0.5 + d.dot(v) / reach];
  });
}

/** A die's geometry, one group per face, and the faces' normals. */
export function dieShape(sides: ThrownDie['sides']): DieShape {
  const faces = sides === 10 ? d10Faces() : facesOf(trianglesOf(SOLIDS[sides]()));
  const geometry = new BufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: Vector3[] = [];
  faces.forEach((tris, i) => {
    const normal = tris
      .map(normalOf)
      .reduce((s, n) => s.add(n), new Vector3())
      .normalize();
    normals.push(normal);
    geometry.addGroup(positions.length / 3, tris.length * 3, i);
    positions.push(...tris.flat().flatMap((p) => [p.x, p.y, p.z]));
    uvs.push(...faceUvs(tris, normal));
  });
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return { geometry, normals };
}

const CAMERA = new Vector3(0, 0, 1);

/** The turn that lays the face with `normal` towards the camera, spun `spin` radians about the view axis. */
export function restingTurn(normal: Vector3, spin: number): Quaternion {
  const face = new Quaternion().setFromUnitVectors(normal.clone().normalize(), CAMERA);
  return new Quaternion().setFromAxisAngle(CAMERA, spin).multiply(face);
}
