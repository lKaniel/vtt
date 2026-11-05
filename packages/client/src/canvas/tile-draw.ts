import type { Chunk } from '@vtt/shared';
import { Assets, BlurFilter, ColorMatrixFilter, Container, Sprite, type Texture, TilingSprite } from 'pixi.js';
import { type GifSource, GifSprite } from 'pixi.js/gif';
import { assetUrl } from '../assets.ts';
import { easeAlpha, roofAlpha, type RoofSight, scrollOffset, tileMedia } from './tile-motion.ts';
import { tilePose } from './tile-pose.ts';

// One picture tile on the map: a still picture, an animated GIF or a looping
// silent video, sliding when it scrolls and fading when it is a roof over
// one of your creatures; turned, mirrored, see-through or tinted, and with a
// soft drop shadow, when it has them.

export type ImageTile = Extract<Chunk['tiles'][number], { kind: 'image' }>;

/** A drawn picture tile; `tick` moves it on (scroll, roof fade). */
export interface TileView {
  root: Container;
  /** Settles once the picture has loaded (or failed to). */
  loaded?: Promise<void>;
  tick?: (dt: number, sight: RoofSight) => void;
  /** Outlines it in gold while the pointer is on it (an object, as in BG3), or stops. */
  glow?: (on: boolean) => void;
}

/** Videos loop and stay quiet; `preload` must be set, or Pixi's loader trips over it. */
const VIDEO = { autoPlay: true, loop: true, muted: true, preload: false };

function load(tile: ImageTile): Promise<Texture | GifSource> {
  const src = assetUrl(tile.src);
  const media = tileMedia(tile.src);
  return Assets.load(media === 'video' ? { src, data: VIDEO } : src);
}

/** The view that shows a loaded picture: a sprite, a GIF, or a tiling sprite for a scrolling one. */
function viewOf(tile: ImageTile, picture: Texture | GifSource): Sprite | TilingSprite | GifSprite {
  if ('frames' in picture) return new GifSprite({ source: picture, autoPlay: true, loop: true });
  if (!tile.scroll) return new Sprite(picture);
  const tiling = new TilingSprite({ texture: picture, width: tile.w, height: tile.h });
  tiling.tileScale.set(tile.w / picture.width, tile.h / picture.height);
  return tiling;
}

/** A sized view of the picture, tinted when the tile is. */
function sizedView(tile: ImageTile, picture: Texture | GifSource): Sprite | TilingSprite | GifSprite {
  const view = viewOf(tile, picture);
  if (!(view instanceof TilingSprite)) view.setSize(tile.w, tile.h);
  if (tile.tint) view.tint = tile.tint;
  if (tile.alpha !== undefined) view.alpha = tile.alpha;
  return view;
}

/** A blurred black copy of the picture, offset down and right. */
function shadowView(tile: ImageTile, picture: Texture | GifSource): Container | undefined {
  if (!tile.shadow) return undefined;
  const shadow = sizedView(tile, picture);
  shadow.tint = 0x000000;
  shadow.alpha = tile.shadow.alpha;
  shadow.position.set(tile.shadow.offset, tile.shadow.offset);
  if (tile.shadow.blur > 0) shadow.filters = [new BlurFilter({ strength: tile.shadow.blur })];
  return shadow;
}

/** Gold where the picture is opaque: each colour channel is the pixel's alpha times gold's. */
const GOLD_MATRIX = [0, 0, 0, 1, 0, 0, 0, 0, 0.78, 0, 0, 0, 0, 0.36, 0, 0, 0, 0, 1, 0] as const;

/** Pixels the glow reaches past the picture's edge. */
const GLOW_RIM = 6;

/** A blurred gold copy of the picture, a little larger, behind it: its outline glowing. */
function glowView(tile: ImageTile, picture: Texture | GifSource): Container {
  const glow = sizedView(tile, picture);
  glow.alpha = 1;
  // A few pixels bigger all round, so a crisp rim shows past the picture's edge before the blur softens it.
  if (!(glow instanceof TilingSprite)) {
    glow.setSize(tile.w + 2 * GLOW_RIM, tile.h + 2 * GLOW_RIM);
    glow.position.set(-GLOW_RIM, -GLOW_RIM);
  }
  const gold = new ColorMatrixFilter();
  gold.matrix = [...GOLD_MATRIX];
  glow.filters = [gold, new BlurFilter({ strength: 4, quality: 3 })];
  return glow;
}

/** The picture's glow, put in behind it or taken away. */
function glowSwitch(tile: ImageTile, root: Container, picture: () => Texture | GifSource | undefined) {
  let glow: Container | undefined;
  return (on: boolean) => {
    const loaded = picture();
    if (on && !glow && loaded) glow = root.addChildAt(glowView(tile, loaded), 0);
    if (!on && glow) {
      if (!glow.destroyed) glow.destroy();
      glow = undefined;
    }
  };
}

export function imageTile(tile: ImageTile): TileView {
  const root = new Container();
  const pose = tilePose(tile);
  root.position.set(...pose.position);
  root.pivot.set(...pose.pivot);
  root.angle = pose.angle;
  root.scale.set(...pose.scale);
  let view: Sprite | TilingSprite | GifSprite | undefined;
  let picture: Texture | GifSource | undefined;
  const glow = glowSwitch(tile, root, () => picture);
  const loaded = load(tile)
    .then((got) => {
      if (root.destroyed) return;
      picture = got;
      view = sizedView(tile, got);
      const shadow = shadowView(tile, got);
      if (shadow) root.addChild(shadow);
      root.addChild(view);
    })
    .catch(() => {
      console.warn(`Missing image assets/${tile.src}`);
    });
  if (!tile.overhead && !tile.scroll) return { root, loaded, glow };
  let seconds = 0;
  const tick = (dt: number, sight: RoofSight) => {
    seconds += dt;
    if (tile.overhead) root.alpha = easeAlpha(root.alpha, roofAlpha(tile, sight.watchers, sight.covers), dt);
    if (tile.scroll && view instanceof TilingSprite) {
      view.tilePosition.set(...scrollOffset(tile.scroll, seconds, tile.w, tile.h));
    }
  };
  return { root, loaded, tick, glow };
}
