import type { Doc } from '@vtt/core';
import { feetToPx, shapeOf, type Template } from '@vtt/shared';
import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { assetUrl } from '../assets.ts';
import { tileMedia } from './tile-motion.ts';
import { traceShape } from './item-draw.ts';

// A template's `texture` (a lasting spell's loop from the game's packs, or a
// picture): laid over the area, clipped to its shape, under the outline.
// Kept per template while it stays put, so a looping video isn't reloaded on
// every redraw.

type Placed = Pick<Template, 'shape' | 'x' | 'y' | 'distance' | 'direction' | 'width'>;

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  anchor: [number, number];
  rotation: number;
}

/** Where the texture lies: over a circle or square, or out from a cone's or line's tip along it. */
export function textureFrame(t: Placed, gridSize: number): Frame {
  const size = feetToPx(t.distance, gridSize);
  const rotation = ((t.direction ?? 0) * Math.PI) / 180;
  if (t.shape === 'circle') return { x: t.x, y: t.y, w: size * 2, h: size * 2, anchor: [0.5, 0.5], rotation: 0 };
  if (t.shape === 'square') return { x: t.x, y: t.y, w: size, h: size, anchor: [0.5, 0.5], rotation };
  const across = t.shape === 'line' ? feetToPx(t.width ?? 5, gridSize) : size;
  return { x: t.x, y: t.y, w: size, h: across, anchor: [0, 0.5], rotation };
}

const VIDEO = { autoPlay: true, loop: true, muted: true, preload: false };

function load(texture: string): Promise<Texture> {
  const src = assetUrl(texture);
  return Assets.load(tileMedia(texture) === 'video' ? { src, data: VIDEO } : src);
}

/** One template's texture, clipped to its shape. */
function look(t: Doc & Placed & { texture: string }, gridSize: number): Container {
  const root = new Container();
  const mask = traceShape(new Graphics(), shapeOf(t, { gridSize, px: 1 })).fill(0xffffff);
  root.addChild(mask);
  root.mask = mask;
  void load(t.texture)
    .then((texture) => {
      if (root.destroyed) return;
      const f = textureFrame(t, gridSize);
      const sprite = new Sprite(texture);
      sprite.anchor.set(...f.anchor);
      sprite.position.set(f.x, f.y);
      sprite.rotation = f.rotation;
      sprite.setSize(f.w, f.h);
      root.addChild(sprite);
    })
    .catch(() => console.warn(`Missing template texture ${t.texture}`));
  return root;
}

const keyOf = (t: Doc) => JSON.stringify([t.texture, t.shape, t.x, t.y, t.distance, t.direction, t.width, t.angle]);

export class TemplateLooks {
  readonly container = new Container();
  private shown = new Map<string, { key: string; view: Container }>();

  /** Shows the textures of these templates, keeping the ones that didn't change. */
  sync(templates: readonly Doc[], gridSize: number): void {
    const next = new Map<string, { key: string; view: Container }>();
    for (const t of templates) {
      if (typeof t.texture !== 'string' || !t.texture) continue;
      const key = keyOf(t);
      const was = this.shown.get(t.id);
      const kept = was?.key === key ? was : { key, view: look(t as Doc & Placed & { texture: string }, gridSize) };
      if (kept !== was) was?.view.destroy({ children: true });
      next.set(t.id, kept);
      this.container.addChild(kept.view);
    }
    for (const [id, gone] of this.shown) if (!next.has(id)) gone.view.destroy({ children: true });
    this.shown = next;
  }
}
