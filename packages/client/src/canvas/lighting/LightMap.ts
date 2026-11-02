import { feetToPx, lightReach, type LightSource, type ReachPolygon, type Rect } from '@vtt/shared';
import { Container, Graphics, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import { ambientColor, falloff, lightColor, lightPulse } from './light-style.ts';

/** Light and sight are drawn at this share of the screen's resolution: cheaper, and the edges come out soft. */
export const MAP_RESOLUTION = 0.5;

export interface ViewTransform {
  scale: number;
  x: number;
  y: number;
}

/** Lines a world-space scene up with the camera. */
export function placeScene(scene: Container, transform: ViewTransform): void {
  scene.scale.set(transform.scale);
  scene.position.set(transform.x, transform.y);
}
const GRADIENT_SIZE = 256;

export interface LightScene {
  view: Rect;
  darkness: number;
  gridSize: number;
  lights: readonly LightSource[];
  /** The area a light reaches from a point, stopped by walls. */
  polygon: ReachPolygon;
  now: number;
}

interface Lamp {
  root: Container;
  glow: Sprite;
  mask: Graphics;
  used: boolean;
}

/**
 * The light falling on each pixel of the screen: the ambient light of the
 * hour, every lamp's coloured glow clipped to what it can reach, and magical
 * darkness that swallows them.
 */
export class LightMap {
  readonly texture: RenderTexture;
  private scene = new Container();
  private ambient = new Graphics();
  private lamps = new Container();
  private darkness = new Graphics();
  private cache = new Map<string, Lamp>();
  private gradients = new Map<string, Texture>();

  constructor(private renderer: Renderer) {
    this.texture = RenderTexture.create({ width: 1, height: 1, resolution: MAP_RESOLUTION });
    this.darkness.blendMode = 'min';
    this.scene.addChild(this.ambient, this.lamps, this.darkness);
  }

  resize(width: number, height: number): void {
    this.texture.resize(width, height);
  }

  /** True when some light on screen moves, so the map must be redrawn every frame. */
  animated(scene: LightScene): boolean {
    return scene.lights.some((l) => l.animation && !l.darkness);
  }

  render(scene: LightScene, transform: ViewTransform): void {
    placeScene(this.scene, transform);
    const { view } = scene;
    this.ambient.clear().rect(view.x, view.y, view.w, view.h).fill(ambientColor(scene.darkness));
    for (const lamp of this.cache.values()) lamp.used = false;
    this.darkness.clear();
    scene.lights.forEach((l, i) => {
      if (l.darkness) this.drawDarkness(l, scene);
      else this.drawLamp(l, i, scene);
    });
    this.sweep();
    this.renderer.render({ container: this.scene, target: this.texture, clear: true });
  }

  /** Walls changed: every lamp's reach must be worked out again. */
  wallsChanged(): void {
    for (const lamp of this.cache.values()) lamp.root.destroy({ children: true });
    this.cache.clear();
  }

  destroy(): void {
    this.scene.destroy({ children: true });
    for (const g of this.gradients.values()) g.destroy(true);
    this.texture.destroy(true);
  }

  private drawDarkness(l: LightSource, scene: LightScene): void {
    const radius = feetToPx(l.bright + l.dim, scene.gridSize);
    if (radius > 0) this.darkness.poly(lightReach(l, scene.gridSize, scene.polygon)).fill(0x000000);
  }

  private drawLamp(l: LightSource, index: number, scene: LightScene): void {
    const radius = feetToPx(l.bright + l.dim, scene.gridSize);
    if (radius <= 0 || !overlaps(l, radius, scene.view)) return;
    const share = l.bright / (l.bright + l.dim);
    const soft = l.attenuation ?? 0.5;
    const key = `${l.x},${l.y},${radius},${share},${soft},${l.angle},${l.rotation},${l.walls}`;
    let lamp = this.cache.get(key);
    if (!lamp) {
      lamp = this.makeLamp(lightReach(l, scene.gridSize, scene.polygon), share, soft);
      this.cache.set(key, lamp);
      this.lamps.addChild(lamp.root);
    }
    lamp.used = true;
    const pulse = lightPulse(l.animation, scene.now, index + l.x * 0.013 + l.y * 0.007);
    lamp.glow.tint = lightColor(l);
    lamp.glow.alpha = Math.min(1, pulse) * (l.luminosity ?? 1);
    lamp.glow.position.set(l.x, l.y);
    lamp.glow.width = lamp.glow.height = radius * 2 * (0.985 + 0.015 * pulse);
  }

  private makeLamp(poly: number[], share: number, soft: number): Lamp {
    const root = new Container();
    const glow = new Sprite(this.gradient(share, soft));
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    const mask = new Graphics().poly(poly).fill(0xffffff);
    root.addChild(glow, mask);
    root.mask = mask;
    return { root, glow, mask, used: true };
  }

  /** Lamps whose light moved or went away. */
  private sweep(): void {
    for (const [key, lamp] of this.cache) {
      if (lamp.used) continue;
      lamp.root.destroy({ children: true });
      this.cache.delete(key);
    }
  }

  /** A round white glow that falls off like a light with `share` of its radius bright, `soft`ly at its edges. */
  private gradient(share: number, soft: number): Texture {
    const step = Math.round(share * 20) / 20;
    const att = Math.round(soft * 10) / 10;
    const key = `${step},${att}`;
    let tex = this.gradients.get(key);
    if (tex) return tex;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = GRADIENT_SIZE;
    const ctx = canvas.getContext('2d')!;
    const half = GRADIENT_SIZE / 2;
    const g = ctx.createRadialGradient(half, half, 0, half, half, half);
    for (let i = 0; i <= 32; i++) {
      const v = Math.round(falloff(i / 32, step, att) * 255);
      g.addColorStop(i / 32, `rgb(${v},${v},${v})`);
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, GRADIENT_SIZE, GRADIENT_SIZE);
    tex = Texture.from(canvas);
    this.gradients.set(key, tex);
    return tex;
  }
}

function overlaps(l: LightSource, radius: number, view: Rect): boolean {
  return (
    l.x + radius > view.x && l.x - radius < view.x + view.w && l.y + radius > view.y && l.y - radius < view.y + view.h
  );
}
