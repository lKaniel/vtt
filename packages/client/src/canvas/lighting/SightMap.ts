import {
  feetToPx,
  lightReach,
  type LightSource,
  type Point,
  type ReachPolygon,
  type Rect,
  type Senses,
} from '@vtt/shared';
import { Container, Graphics, RenderTexture, type Renderer } from 'pixi.js';
import { MAP_RESOLUTION, placeScene, type ViewTransform } from './LightMap.ts';

export interface SightViewer {
  at: Point;
  senses: Senses;
  /** Feet up: walls lower than this don't block it. */
  elevation?: number;
}

export interface SightScene {
  view: Rect;
  gridSize: number;
  viewers: readonly SightViewer[];
  /** Sources of magical darkness, which put out darkvision. */
  darkness: readonly LightSource[];
  /** How far eyes reach when nothing blocks them, in pixels. */
  sightRadius: number;
  polygon: ReachPolygon;
}

/**
 * What your tokens perceive, one channel each, for the lighting filter:
 * red where a sense works without light (darkvision, blindsight...),
 * green where you can see right now, blue where you have been.
 */
export class SightMap {
  readonly texture: RenderTexture;
  private scene = new Container();
  private background = new Graphics();
  private sight = new Graphics();
  private senses = new Graphics();
  private darkness = new Graphics();
  /** Senses that work in magical darkness: devil's sight, truesight, blindsight. */
  private keenSenses = new Graphics();

  /** `explored` is drawn in white; it is tinted blue here. */
  constructor(
    private renderer: Renderer,
    explored: Container,
  ) {
    this.texture = RenderTexture.create({ width: 1, height: 1, resolution: MAP_RESOLUTION });
    for (const g of [this.sight, this.senses, this.keenSenses, explored]) g.blendMode = 'add';
    explored.tint = 0x0000ff;
    this.darkness.blendMode = 'min';
    this.scene.addChild(this.background, this.sight, explored, this.senses, this.darkness, this.keenSenses);
  }

  resize(width: number, height: number): void {
    this.texture.resize(width, height);
  }

  render(scene: SightScene, transform: ViewTransform): void {
    placeScene(this.scene, transform);
    const { view } = scene;
    this.background.clear().rect(view.x, view.y, view.w, view.h).fill(0x000000);
    for (const g of [this.sight, this.senses, this.darkness, this.keenSenses]) g.clear();
    const range = (feet: number) => feetToPx(feet, scene.gridSize);
    for (const v of scene.viewers) {
      this.sight.poly(scene.polygon(v.at, scene.sightRadius, 'sight', v.elevation)).fill(0x00ff00);
      this.area(this.senses, scene, v.at, range(v.senses.darkvision));
      const keen = Math.max(v.senses.devilsSight, v.senses.truesight, v.senses.blindsight);
      this.area(this.keenSenses, scene, v.at, range(keen));
    }
    // Magical darkness puts out darkvision (red) but leaves sight and memory alone.
    for (const l of scene.darkness) {
      if (l.bright + l.dim > 0) this.darkness.poly(lightReach(l, scene.gridSize, scene.polygon)).fill(0x00ffff);
    }
    this.renderer.render({ container: this.scene, target: this.texture, clear: true });
  }

  destroy(): void {
    this.scene.destroy({ children: true });
    this.texture.destroy(true);
  }

  private area(g: Graphics, scene: SightScene, at: Point, radius: number): void {
    if (radius <= 0) return;
    g.poly(scene.polygon(at, radius, 'sight')).fill(0xff0000);
  }
}
