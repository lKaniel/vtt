import { feetToPx } from '@vtt/shared';
import type { AuraRing } from '@vtt/system-dnd5e';
import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { assetUrl } from '../assets.ts';

// What a creature wears on the map beyond its face (TokenLayer draws the
// rest): a ring for each aura it gives off (Aura of Protection), reaching
// out from its edge, and the looping videos of the spells and conditions on
// it (effect-loops.ts in system-dnd5e), under its face. Kept per token while
// its dress stays the same, so a looping video isn't reloaded on every redraw.

const RING_COLORS: Record<AuraRing['who'], number> = { allies: 0xe8c66a, enemies: 0xd05040, all: 0xc8c0e8 };
/** A loop covers this many times the token's box. */
const LOOP_COVER = 1.5;
const VIDEO = { autoPlay: true, loop: true, muted: true, preload: false };

interface Dressed {
  x: number;
  y: number;
  size: number;
  auras?: AuraRing[];
  loops?: string[];
}

export interface Dress {
  rings: { r: number; color: number; name: string }[];
  loops: { src: string; size: number }[];
}

/** The rings (radius in map pixels from the token's centre) and loops (size across) a token wears. */
export function dressOf(token: Dressed, gridSize: number): Dress {
  const half = (token.size * gridSize) / 2;
  return {
    rings: (token.auras ?? []).map((a) => ({
      r: feetToPx(a.radius, gridSize) + half,
      color: RING_COLORS[a.who],
      name: a.name,
    })),
    loops: (token.loops ?? []).map((src) => ({ src, size: token.size * gridSize * LOOP_COVER })),
  };
}

function loopSprite(src: string, size: number, root: Container): void {
  void Assets.load<Texture>({ src: assetUrl(src), data: VIDEO })
    .then((texture) => {
      if (root.destroyed) return;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.setSize(size, size);
      root.addChild(sprite);
    })
    .catch(() => console.warn(`Missing loop ${src}`));
}

function build(dress: Dress): Container {
  const root = new Container();
  const g = new Graphics();
  for (const ring of dress.rings)
    g.circle(0, 0, ring.r).fill({ color: ring.color, alpha: 0.05 }).stroke({ width: 3, color: ring.color, alpha: 0.5 });
  root.addChild(g);
  for (const loop of dress.loops) loopSprite(loop.src, loop.size, root);
  return root;
}

/** Each token's dress, laid at the bottom of its view so it follows the token as it walks (and goes with it). */
export class TokenDress {
  private shown = new Map<string, { key: string; view: Container }>();

  /** Puts `token`'s dress under its view `root`, keeping it when nothing changed. */
  dress(root: Container, token: Dressed & { id: string }, gridSize: number): void {
    const dress = dressOf(token, gridSize);
    const key = JSON.stringify(dress);
    const was = this.shown.get(token.id);
    if (was?.key === key && !was.view.destroyed) return;
    was?.view.destroy({ children: true });
    if (!dress.rings.length && !dress.loops.length) {
      this.shown.delete(token.id);
      return;
    }
    const view = build(dress);
    root.addChildAt(view, 0);
    this.shown.set(token.id, { key, view });
  }
}
