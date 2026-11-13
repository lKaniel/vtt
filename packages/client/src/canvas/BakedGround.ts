import { type BakeGroup, bakeSpan, type Chunk, type Rect, tilesOnFloor } from '@vtt/shared';
import { Assets, Container, Sprite, type Texture } from 'pixi.js';
import { assetUrl } from '../assets.ts';
import type { Session } from '../session/session.ts';
import { blocksToShow } from './bake-blocks.ts';

// An optimised scene's floor pictures on the map (session-bake.ts): each
// floor's picture pyramid shown in place of the tiles baked into it, blocks
// of the zoom the screen needs loaded as the camera moves and let go when
// too many are held. A floor's picture lies under every live tile of its
// floor; a floor seen from below (drawn as roofs) shows its tiles instead.

/** Blocks a floor may hold before those out of view are let go (512² each: about 1 MB). */
const MAX_BLOCKS = 160;
/** Blocks loading at once. */
const LOADS = 6;
/** Blocks this far past the screen (a share of its size) are loaded ahead. */
const AHEAD = 0.25;

/** A floor's picture in the floor tiles' draw order, as ChunkLayer stacks it. */
export interface BakedEntry {
  id: string;
  z: number;
  still: false;
  root: Container;
  bounds: Rect;
}

interface Block {
  texture?: Texture;
  used: number;
}

/** One floor's pyramid on the map. */
class FloorPicture {
  readonly root = new Container({ eventMode: 'none', sortableChildren: true });
  private blocks = new Map<string, Block>();
  private sprites = new Map<string, Sprite>();
  private loading = 0;
  private frame = 0;

  constructor(
    readonly group: BakeGroup,
    private readonly url: (key: string) => string,
    private readonly scale: number,
  ) {}

  show(view: Rect, screenPerMap: number): void {
    this.frame++;
    const loaded = (key: string) => !!this.blocks.get(key)?.texture;
    const { want, show } = blocksToShow(this.group, { scale: this.scale, screenPerMap, view }, loaded);
    for (const key of want) this.fetch(key);
    for (const key of show) this.blocks.get(key)!.used = this.frame;
    for (const [key, sprite] of this.sprites) sprite.visible = show.includes(key);
    for (const key of show) this.sprite(key).visible = true;
    this.evict();
  }

  private sprite(key: string): Sprite {
    let sprite = this.sprites.get(key);
    if (sprite) return sprite;
    const [zoom, place] = key.split('/') as [string, string];
    const [x, y] = place.split('_').map(Number) as [number, number];
    const span = bakeSpan(this.scale, Number(zoom));
    sprite = new Sprite(this.blocks.get(key)!.texture);
    sprite.position.set(this.group.x + x * span, this.group.y + y * span);
    sprite.setSize(span, span);
    sprite.zIndex = -Number(zoom);
    this.sprites.set(key, sprite);
    this.root.addChild(sprite);
    return sprite;
  }

  private fetch(key: string): void {
    if (this.blocks.has(key) || this.loading >= LOADS) return;
    const block: Block = { used: this.frame };
    this.blocks.set(key, block);
    this.loading++;
    Assets.load<Texture>(this.url(key))
      .then((texture) => {
        if (this.root.destroyed) return;
        block.texture = texture;
      })
      .catch(() => console.warn(`Missing block ${key} of the optimised scene`))
      .finally(() => this.loading--);
  }

  /** Lets go of the blocks shown longest ago, out of view, while over the limit. */
  private evict(): void {
    const idle = [...this.blocks].filter(([, b]) => b.texture && b.used !== this.frame);
    let over = this.blocks.size - MAX_BLOCKS;
    for (const [key] of idle.toSorted(([, a], [, b]) => a.used - b.used)) {
      if (over-- <= 0) return;
      this.drop(key);
    }
  }

  private drop(key: string): void {
    this.sprites.get(key)?.destroy();
    this.sprites.delete(key);
    this.blocks.delete(key);
    void Assets.unload(this.url(key)).catch(() => undefined);
  }

  destroy(): void {
    for (const key of [...this.blocks.keys()]) if (this.blocks.get(key)!.texture) this.drop(key);
    this.root.destroy({ children: true });
  }
}

type ChunkTile = Chunk['tiles'][number];

/** The floor pictures of the scene's bake, for ChunkLayer to stack with the floor tiles. */
export class BakedGround {
  private floors: FloorPicture[] = [];
  private version = -1;
  private view?: Rect;
  private screenPerMap = 1;

  constructor(private readonly session: Session) {}

  /** Whether the map draws this tile (as the shown floor sees it) from a floor picture. */
  covers(tile: ChunkTile): boolean {
    return this.session.bake.baked(tile);
  }

  /** Takes up the bake as it stands now (another bake, or none). */
  sync(): void {
    if (this.version === this.session.bake.version) return;
    this.version = this.session.bake.version;
    for (const f of this.floors) f.destroy();
    const shown = this.session.bake.shown;
    if (!shown) {
      this.floors = [];
      return;
    }
    const { manifest, folder } = shown;
    this.floors = manifest.groups.map(
      (group, i) => new FloorPicture(group, (key) => assetUrl(`${folder}/${i}/${key}.${manifest.ext}`), manifest.scale),
    );
  }

  /** The floor pictures shown flat on the floors in view, at the bottom of their floor's tiles; the others come off the map. */
  entries(): BakedEntry[] {
    const { shown, current } = this.session.levels;
    const levels = this.session.world?.levels;
    return this.floors.flatMap((f, i) => {
      f.root.removeFromParent();
      const probe = { kind: 'image', id: `bake-${i}`, src: '', x: 0, y: 0, w: 1, h: 1, z: -0.5 } as ChunkTile;
      const level = f.group.level && { level: f.group.level };
      const [placed] = tilesOnFloor([{ ...probe, ...level }], levels, shown, current);
      // Seen from below, its tiles are drawn as roofs instead (they no longer match the bake).
      if (!placed || (placed.kind === 'image' && placed.overhead)) return [];
      const { x, y, w, h } = f.group;
      return [{ id: probe.id, z: placed.z!, still: false as const, root: f.root, bounds: { x, y, w, h } }];
    });
  }

  setView(view: Rect, screenPerMap: number): void {
    this.view = view;
    this.screenPerMap = screenPerMap;
  }

  tick(): void {
    const view = this.view;
    if (!view) return;
    const pad = { x: view.w * AHEAD, y: view.h * AHEAD };
    const wide = { x: view.x - pad.x, y: view.y - pad.y, w: view.w + 2 * pad.x, h: view.h + 2 * pad.y };
    for (const f of this.floors) if (f.root.parent) f.show(wide, this.screenPerMap);
  }

  destroy(): void {
    for (const f of this.floors) f.destroy();
    this.floors = [];
  }
}
