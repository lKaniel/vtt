import { type Heightmap, type ModelGround, type Terrain3D, terrainCells, terrainLift } from '@vtt/shared';
import * as THREE from 'three';
import { assetUrl } from '../assets.ts';
import type { TerrainShown } from './content3d.ts';
import { terrainMaterial } from './terrain-paint.ts';

// Terrain in the 3D view (terrain3d.ts in shared), built as 3D Canvas builds
// it: a box over the tile whose vertices above its bottom the heightmap
// raises (the sides follow it like a skirt), stretched so its peak stands
// `height` up, turned with the tile and painted by height or slope
// (terrain-paint.ts). Its pictures load once each.

/** The box in pixels, its bottom at y 0 and its middle over x, z 0, with how high (0–1) each vertex stands as `rise`. */
export function terrainGeometry(
  rect: { w: number; h: number },
  terrain: Terrain3D,
  map: Heightmap,
  scale: { grid: number; px: number },
): THREE.BufferGeometry {
  const [cols, rows] = terrainCells(rect, terrain, scale.grid);
  const height = terrain.height * scale.px;
  const geometry = new THREE.BoxGeometry(rect.w, height, rect.h, cols, 1, rows).translate(0, height / 2, 0);
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const raised: number[] = [];
  const spots: [number, number][] = [];
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) <= 0) continue;
    raised.push(i);
    spots.push([pos.getX(i) / rect.w + 0.5, pos.getZ(i) / rect.h + 0.5]);
  }
  const lift = terrainLift(map, spots, terrain);
  raised.forEach((i, k) => pos.setY(i, lift[k]! * scale.px));
  const rise = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) rise[i] = height > 0 ? pos.getY(i) / height : 0;
  geometry.setAttribute('rise', new THREE.BufferAttribute(rise, 1));
  geometry.computeVertexNormals();
  return geometry;
}

const maps = new Map<string, Promise<Heightmap | undefined>>();

/** A heightmap picture's red, read once per file. */
function heightmap(src: string): Promise<Heightmap | undefined> {
  let map = maps.get(src);
  if (!map) {
    map = new THREE.ImageLoader()
      .loadAsync(assetUrl(src))
      .then(redOf)
      .catch((e: unknown) => {
        console.warn(`Heightmap ${src} did not load: ${e instanceof Error ? e.message : String(e)}`);
        return undefined;
      });
    maps.set(src, map);
  }
  return map;
}

function redOf(image: HTMLImageElement): Heightmap {
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = [image.naturalWidth || image.width, image.naturalHeight || image.height];
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width, height, red: (x, y) => data[(y * width + x) * 4]! };
}

interface Raised {
  shown: TerrainShown;
  mesh?: THREE.Mesh;
}

/** Puts a built terrain over its tile, its bottom at its elevation over the floor shown. */
function stand({ mesh, shown }: Raised, ground: ModelGround, floorPx: number): void {
  const base = ((shown.terrain.elevation ?? ground.floor) - ground.floor) * (ground.grid / ground.feet);
  mesh?.position.set(shown.rect.x + shown.rect.w / 2, floorPx + base, shown.rect.y + shown.rect.h / 2);
}

/** The terrain standing in the 3D view. */
export class Terrains {
  readonly group = new THREE.Group();
  private raised = new Map<string, Raised>();
  private stale = true;
  private down = new THREE.Raycaster();

  /** `load` reads a heightmap picture (the page's own loader unless a test gives one). */
  constructor(private readonly load: (src: string) => Promise<Heightmap | undefined> = heightmap) {}

  /** Shows exactly these; `ground` and `floorPx` say where the floor shown is. */
  show(all: readonly TerrainShown[], ground: ModelGround, floorPx: number): void {
    const keep = new Set(all.map((t) => t.key));
    for (const [key, r] of this.raised) if (!keep.has(key)) this.drop(key, r);
    for (const shown of all) if (!this.raised.has(shown.key)) this.add(shown, ground);
    if (!this.stale) return;
    this.stale = false;
    for (const r of this.raised.values()) stand(r, ground, floorPx);
  }

  /** Marks them to be stood again (the floor shown changed). */
  restand(): void {
    this.stale = true;
  }

  get count(): number {
    let n = 0;
    for (const r of this.raised.values()) if (r.mesh) n++;
    return n;
  }

  /** The terrain's meshes, for the pointer to hit. */
  get meshes(): THREE.Object3D[] {
    return [...this.raised.values()].flatMap((r) => (r.mesh ? [r.mesh] : []));
  }

  /** How high (three's y) the terrain stands over a map point, if it covers it. */
  heightAt(x: number, y: number): number | undefined {
    const meshes = this.meshes;
    if (!meshes.length) return undefined;
    this.down.set(new THREE.Vector3(x, 1e7, y), new THREE.Vector3(0, -1, 0));
    return this.down.intersectObjects(meshes, false)[0]?.point.y;
  }

  private add(shown: TerrainShown, ground: ModelGround): void {
    const r: Raised = { shown };
    this.raised.set(shown.key, r);
    void this.load(shown.terrain.heightmap).then((map) => {
      if (!map || this.raised.get(shown.key) !== r) return;
      const scale = { grid: ground.grid, px: ground.grid / ground.feet };
      const mesh = new THREE.Mesh(
        terrainGeometry(shown.rect, shown.terrain, map, scale),
        terrainMaterial(shown.terrain),
      );
      mesh.rotation.y = -((shown.terrain.rotation ?? 0) * Math.PI) / 180;
      r.mesh = mesh;
      this.group.add(mesh);
      this.stale = true;
    });
  }

  private drop(key: string, r: Raised): void {
    this.raised.delete(key);
    if (!r.mesh) return;
    this.group.remove(r.mesh);
    r.mesh.geometry.dispose();
    (r.mesh.material as THREE.Material).dispose();
  }

  dispose(): void {
    for (const [key, r] of this.raised) this.drop(key, r);
  }
}
