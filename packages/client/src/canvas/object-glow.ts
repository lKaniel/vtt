import type { Chunk } from '@vtt/shared';
import { Graphics } from 'pixi.js';
import { type ObjectRef, refKey } from '../play/objects.ts';
import type { TileView } from './tile-draw.ts';

// The object under the pointer glows gold, as in BG3 (play/objects.ts): a
// picture tile around its outline (tile-draw.ts), a door along its leaf, a
// plain rect tile around its edge. Piles are creatures' tokens, which ring
// when hovered (TokenLayer). The 3D view lights models itself (View3D).

const GOLD = 0xffc45a;

export interface GlowScene {
  readonly chunks: ReadonlyMap<string, Chunk>;
  /** The object under the pointer. */
  readonly hover?: ObjectRef;
  /** A tile as drawn now. */
  tileView(id: string): TileView | undefined;
}

export class ObjectGlow {
  /** Door and rect tile outlines, over the walls. */
  readonly outline = new Graphics({ eventMode: 'none', zIndex: 1e9 });
  private shown = '';
  private lit?: TileView;

  /** Called each frame: follows the pointer, and lights a picture once it has loaded or been drawn again. */
  update(scene: GlowScene): void {
    const ref = scene.hover;
    const key = refKey(ref);
    const view = ref?.kind === 'tile' ? scene.tileView(ref.id) : undefined;
    if (view !== this.lit) this.lit?.glow?.(false);
    this.lit = view;
    view?.glow?.(true);
    if (key === this.shown) return;
    this.shown = key;
    this.outline.clear();
    if (ref) this.draw(ref, scene, !!view?.glow);
  }

  private draw(ref: ObjectRef, scene: GlowScene, pictured: boolean): void {
    if (ref.kind === 'door') {
      const wall = scene.chunks.get(ref.chunk)?.walls.find((w) => w.id === ref.id);
      if (!wall) return;
      for (const [width, alpha] of GLOW_STROKES)
        this.outline
          .moveTo(...wall.a)
          .lineTo(...wall.b)
          .stroke({ width, color: GOLD, alpha, cap: 'round' });
      return;
    }
    if (ref.kind !== 'tile' || pictured) return;
    const tile = [...scene.chunks.values()].flatMap((c) => c.tiles).find((t) => t.id === ref.id);
    if (tile)
      for (const [width, alpha] of GLOW_STROKES)
        this.outline.rect(tile.x, tile.y, tile.w, tile.h).stroke({ width, color: GOLD, alpha });
  }
}

/** A soft wide stroke under a bright thin one. */
const GLOW_STROKES = [
  [22, 0.3],
  [7, 1],
] as const;
