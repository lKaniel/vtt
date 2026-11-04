import { type ModelGround, solidSpan } from '@vtt/shared';
import * as THREE from 'three';
import { assetUrl } from '../assets.ts';
import type { SolidShown } from './content3d.ts';

// The drawn solids of the 3D view (solid3d.ts in shared): each outline
// extruded as tall as asked, standing from its base, covered in its picture
// if it has one. Built once per shape, stood again when the floor shown changes.

const GREY = '#8a8a8a';
/** Loads a picture (a stand-in in tests, which have no document). */
type LoadPicture = (url: string) => THREE.Texture;
const loadPicture: LoadPicture = (url) => new THREE.TextureLoader().load(url);

/**
 * Its picture, repeated `repeat` times across the outline. The extrusion's
 * UVs are the map's pixels, so one repeat spans a pixel unless scaled.
 */
function pictureOf(shown: SolidShown, load: LoadPicture): THREE.Texture | null {
  const { texture, repeat = 1 } = shown.solid;
  if (!texture) return null;
  const span = (i: 0 | 1) => {
    const all = shown.outline.map((p) => p[i]);
    return Math.max(1, Math.max(...all) - Math.min(...all));
  };
  const map = load(assetUrl(texture));
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.repeat.set(repeat / span(0), repeat / span(1));
  return map;
}

/** The outline, extruded `height` pixels up (three.js's y), lying on the map's x and z. */
function solidGeometry(outline: readonly [number, number][], height: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  // Extruded along +z: turned so it rises along +y, the map's y along three's z.
  return geometry.rotateX(Math.PI / 2).translate(0, height, 0);
}

export class Solids {
  readonly group = new THREE.Group();
  private meshes = new Map<string, { mesh: THREE.Mesh; shown: SolidShown }>();
  private stale = true;

  constructor(private readonly load: LoadPicture = loadPicture) {}

  /** Shows exactly these solids on the floor `floorPx` pixels up. */
  show(all: readonly SolidShown[], ground: ModelGround, floorPx: number): void {
    const keep = new Set(all.map((s) => s.key));
    for (const [key, m] of this.meshes) if (!keep.has(key)) this.drop(key, m.mesh);
    for (const shown of all) if (!this.meshes.has(shown.key)) this.add(shown, ground);
    if (!this.stale) return;
    this.stale = false;
    for (const { mesh, shown } of this.meshes.values()) mesh.position.y = floorPx + solidSpan(shown.solid, ground).base;
  }

  /** Marks them to be stood again (the floor shown changed). */
  restand(): void {
    this.stale = true;
  }

  get count(): number {
    return this.meshes.size;
  }

  private add(shown: SolidShown, ground: ModelGround): void {
    const geometry = solidGeometry(shown.outline, solidSpan(shown.solid, ground).height);
    const map = pictureOf(shown, this.load);
    const color = shown.solid.color ?? (map ? '#ffffff' : GREY);
    const material = new THREE.MeshStandardMaterial({ color, map, roughness: 0.9 });
    const mesh = new THREE.Mesh(geometry, material);
    this.meshes.set(shown.key, { mesh, shown });
    this.group.add(mesh);
    this.stale = true;
  }

  private drop(key: string, mesh: THREE.Mesh): void {
    this.group.remove(mesh);
    mesh.geometry.dispose();
    const material = mesh.material as THREE.MeshStandardMaterial;
    material.map?.dispose();
    material.dispose();
    this.meshes.delete(key);
  }

  dispose(): void {
    for (const [key, m] of this.meshes) this.drop(key, m.mesh);
  }
}
