import type { WorldInfo } from '@vtt/shared';
import * as THREE from 'three';
import { Backdrop, hazeOf } from './scene3d.ts';

// The 3D view's light and surroundings: a sky light and a sun dimmed by the
// scene's darkness, the sky picture lighting the scene as 3D Canvas lets it,
// the ground beyond the map under the lowest floor (so the floors below
// yours show), and the haze far off.

/** Where the camera is, for the sun and the haze: its target (three's axes), distance, reach. */
export interface Seen {
  target: readonly [number, number, number];
  distance: number;
  /** How far the haze lets you see past the target, pixels. */
  reach: number;
  /** The lowest floor's height, three's y. */
  lowest: number;
  grid: number;
}

export class Lighting {
  readonly backdrop = new Backdrop();
  private hemi = new THREE.HemisphereLight(0xfff4e0, 0x403830, 1.2);
  private sun = new THREE.DirectionalLight(0xffffff, 1.4);
  private pmrem: THREE.PMREMGenerator;
  private litBy?: THREE.Texture;

  constructor(
    renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
  ) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    scene.add(this.hemi, this.sun, this.sun.target, this.backdrop.table);
  }

  /** Lights the scene as `world` has it, round what the camera sees. */
  show(world: WorldInfo, seen: Seen): void {
    const [x, y, z] = seen.target;
    const light = 1 - 0.8 * world.darkness;
    this.hemi.intensity = 1.2 * light;
    this.sun.intensity = 1.4 * light;
    this.sun.position.set(x - 2000, y + 4000, z - 1500);
    this.sun.target.position.set(x, y, z);
    const background = world.background ?? '#1b1d22';
    const v = world.view3d;
    const look = { sky: v?.sky, ground: v?.ground ?? background, background, ...(v?.fog && { fog: v.fog }) };
    this.backdrop.show(this.scene, look, seen.lowest);
    this.scene.fog = hazeOf(look, seen.grid, [seen.distance + seen.reach * 0.4, seen.distance + seen.reach * 1.1]);
    this.skyLight(this.backdrop.skyPicture);
  }

  /** The sky lights the scene (its picture as the environment), once it has loaded. */
  private skyLight(sky: THREE.Texture | undefined): void {
    const ready = sky?.image ? sky : undefined;
    if (ready === this.litBy) return;
    this.litBy = ready;
    this.scene.environment?.dispose();
    this.scene.environment = ready ? this.pmrem.fromEquirectangular(ready).texture : null;
  }

  dispose(): void {
    this.backdrop.dispose();
    this.scene.environment?.dispose();
    this.pmrem.dispose();
  }
}
