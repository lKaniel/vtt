import type { Point } from '@vtt/shared';
import * as THREE from 'three';
import type { WallBox, WallKind } from './walls3d.ts';

// What the 3D view draws (View3D.ts): the 2D map laid on the floor, the
// walls stood up, and the creatures standing on their spots. Three.js has y
// up; a map point (x, y) at height h is (x, h, y) there.

/** A map point at a height, as three.js has it. */
export const at3d = ([x, y]: Point, height: number) => new THREE.Vector3(x, height, y);

/** The 2D map's picture of the ground it was asked to draw, lying on the floor. */
export class Ground {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private texture: THREE.CanvasTexture;

  constructor(canvas: HTMLCanvasElement) {
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: this.texture }));
  }

  /** Lays the picture just drawn over the square it shows. */
  show(center: Point, half: number, floor: number): void {
    this.mesh.position.copy(at3d(center, floor));
    this.mesh.scale.set(2 * half, 1, 2 * half);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

const WALL_LOOKS: Record<WallKind, THREE.MeshStandardMaterialParameters> = {
  wall: { color: 0x8c8274, roughness: 0.95 },
  door: { color: 0x7a4e26, roughness: 0.8 },
  window: { color: 0x9fc8ff, roughness: 0.2, transparent: true, opacity: 0.3, depthWrite: false },
};
/** How thick a wall stands, pixels. */
const THICKNESS = 8;
const MAX_WALLS = 20000;

/** The walls, one instanced box per kind. */
export class Walls {
  readonly group = new THREE.Group();
  private meshes = new Map<WallKind, THREE.InstancedMesh>();
  private geometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

  constructor() {
    for (const kind of Object.keys(WALL_LOOKS) as WallKind[]) {
      const mesh = new THREE.InstancedMesh(this.geometry, new THREE.MeshStandardMaterial(WALL_LOOKS[kind]), MAX_WALLS);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.meshes.set(kind, mesh);
      this.group.add(mesh);
    }
  }

  /** Stands these walls on a floor at height `floor` (pixels). */
  show(boxes: readonly WallBox[], floor: number): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [kind, mesh] of this.meshes) {
      const mine = boxes.filter((b) => b.kind === kind).slice(0, MAX_WALLS);
      mine.forEach((b, i) => {
        q.setFromAxisAngle(up, -b.angle);
        m.compose(
          at3d(b.mid, floor + b.bottom),
          q,
          new THREE.Vector3(b.length + THICKNESS / 2, Math.max(1, b.height), THICKNESS),
        );
        mesh.setMatrixAt(i, m);
      });
      mesh.count = mine.length;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    for (const mesh of this.meshes.values()) (mesh.material as THREE.Material).dispose();
  }
}

/** A creature as the 3D view shows it. */
export interface Standing {
  id: string;
  at: Point;
  /** Pixels above the floor shown. */
  height: number;
  /** Pixels across (its size in squares times the grid). */
  size: number;
  picture: string;
  faint: boolean;
}

/** The creatures, each a picture standing on its spot and turning to the camera. */
export class Standees {
  readonly group = new THREE.Group();
  private sprites = new Map<string, THREE.Sprite>();
  private textures = new Map<string, THREE.Texture>();
  private loader = new THREE.TextureLoader();

  private textureOf(url: string): THREE.Texture {
    let tex = this.textures.get(url);
    if (!tex) {
      tex = this.loader.load(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(url, tex);
    }
    return tex;
  }

  /** Shows exactly these creatures. */
  show(all: readonly Standing[], floor: number): void {
    const keep = new Set(all.map((s) => s.id));
    for (const [id, sprite] of this.sprites) {
      if (keep.has(id)) continue;
      this.group.remove(sprite);
      sprite.material.dispose();
      this.sprites.delete(id);
    }
    for (const s of all) this.place(s, floor);
  }

  private place(s: Standing, floor: number): void {
    let sprite = this.sprites.get(s.id);
    if (!sprite) {
      sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.1 }));
      sprite.center.set(0.5, 0);
      sprite.userData.token = s.id;
      this.sprites.set(s.id, sprite);
      this.group.add(sprite);
    }
    const map = this.textureOf(s.picture);
    if (sprite.material.map !== map) {
      sprite.material.map = map;
      sprite.material.needsUpdate = true;
    }
    sprite.material.opacity = s.faint ? 0.5 : 1;
    sprite.position.copy(at3d(s.at, floor + s.height));
    sprite.scale.set(s.size, s.size, 1);
  }

  /** The creature whose picture a ray hits first. */
  hit(ray: THREE.Raycaster): string | undefined {
    const [first] = ray.intersectObjects([...this.sprites.values()], false);
    return first?.object.userData.token as string | undefined;
  }

  dispose(): void {
    for (const s of this.sprites.values()) s.material.dispose();
    for (const t of this.textures.values()) t.dispose();
  }
}

/** What is round the map: the sky (a panorama picture, or the background colour) and the ground beyond the map. */
export class Backdrop {
  readonly table: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private sky?: { src: string; texture: THREE.Texture };
  private loader = new THREE.TextureLoader();

  constructor() {
    const geometry = new THREE.PlaneGeometry(1e6, 1e6);
    geometry.rotateX(-Math.PI / 2);
    this.table = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x1b1d22 }));
  }

  /** Lays the ground just under the floor at height `floor`; the sky's picture, else `background`. */
  show(scene: THREE.Scene, look: { sky?: string; ground: string; background: string }, floor: number): void {
    this.table.position.set(0, floor - 2, 0);
    this.table.material.color.set(look.ground);
    scene.background = this.skyOf(look.sky) ?? new THREE.Color(look.background);
  }

  private skyOf(src: string | undefined): THREE.Texture | undefined {
    if (!src) return undefined;
    if (this.sky?.src !== src) {
      this.sky?.texture.dispose();
      const texture = this.loader.load(src);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      this.sky = { src, texture };
    }
    return this.sky.texture;
  }

  dispose(): void {
    this.sky?.texture.dispose();
    this.table.geometry.dispose();
    this.table.material.dispose();
  }
}
