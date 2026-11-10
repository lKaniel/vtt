import type { WorldInfo } from '@vtt/shared';
import * as THREE from 'three';
import { Backdrop, hazeOf } from './scene3d.ts';
import { ambientColor } from '../canvas/lighting/light-style.ts';

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
  /** Your creature is inside a building (inside3d.ts), where the sky's light doesn't reach. */
  indoors?: boolean;
}

/** How much of the sky's light falls: less the darker the hour, and inside as little as at midnight. */
export function skyShare(darkness: number, indoors: boolean): number {
  return 1 - 0.8 * (indoors ? 1 : darkness);
}

/** The sky's light eases in and out over half a second as you go in and out. */
const EASE_PER_SECOND = 2;

export class Lighting {
  readonly backdrop = new Backdrop();
  private hemi = new THREE.HemisphereLight(0xfff4e0, 0x403830, 1.2);
  private sun = new THREE.DirectionalLight(0xffffff, 1.4);
  private pmrem: THREE.PMREMGenerator;
  private litBy?: THREE.Texture;
  private share?: number;
  private shownAt = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    /** The orange of dawn and dusk, 0 to 1 (session-time.ts). */
    private readonly glowOf: (world: WorldInfo) => number = () => 0,
  ) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    scene.add(this.hemi, this.sun, this.sun.target, this.backdrop.table);
  }

  /** Lights the scene as `world` has it, round what the camera sees. */
  show(world: WorldInfo, seen: Seen): void {
    const [x, y, z] = seen.target;
    const light = this.ease(skyShare(world.darkness, !!seen.indoors));
    this.hemi.intensity = 1.2 * light;
    this.sun.intensity = 1.4 * light;
    this.sun.color.set(ambientColor(0, seen.indoors ? 0 : this.glowOf(world)));
    this.scene.environmentIntensity = light;
    this.sun.position.set(x - 2000, y + 4000, z - 1500);
    this.sun.target.position.set(x, y, z);
    const background = world.background ?? '#1b1d22';
    const v = world.view3d;
    const look = { sky: v?.sky, ground: v?.ground ?? background, background, ...(v?.fog && { fog: v.fog }) };
    this.backdrop.show(this.scene, look, seen.lowest);
    this.scene.fog = hazeOf(look, seen.grid, [seen.distance + seen.reach * 0.4, seen.distance + seen.reach * 1.1]);
    this.skyLight(this.backdrop.skyPicture);
  }

  private ease(target: number): number {
    const now = performance.now();
    const step = EASE_PER_SECOND * Math.min(1, (now - this.shownAt) / 1000);
    this.shownAt = now;
    const from = this.share ?? target;
    this.share = Math.abs(target - from) <= step ? target : from + Math.sign(target - from) * step;
    return this.share;
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
