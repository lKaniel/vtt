import type { Chunk, Point } from '@vtt/shared';
import { Assets, BlurFilter, Container, Sprite, type Texture, TilingSprite } from 'pixi.js';
import { type GifSource, GifSprite } from 'pixi.js/gif';
import { assetUrl } from '../assets.ts';
import { easeAlpha, roofAlpha, scrollOffset, tileMedia } from './tile-motion.ts';

// One picture tile on the map: a still picture, an animated GIF or a looping
// silent video, sliding when it scrolls and fading when it is a roof over
// one of your creatures; tinted, and with a soft drop shadow, when it has them.

export type ImageTile = Extract<Chunk['tiles'][number], { kind: 'image' }>;

/** A drawn picture tile; `tick` moves it on (scroll, roof fade). */
export interface TileView {
  root: Container;
  tick?: (dt: number, watchers: readonly Point[]) => void;
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

export function imageTile(tile: ImageTile): TileView {
  const root = new Container();
  root.position.set(tile.x, tile.y);
  let view: Sprite | TilingSprite | GifSprite | undefined;
  load(tile)
    .then((picture) => {
      if (root.destroyed) return;
      view = sizedView(tile, picture);
      const shadow = shadowView(tile, picture);
      if (shadow) root.addChild(shadow);
      root.addChild(view);
    })
    .catch(() => {
      console.warn(`Missing image assets/${tile.src}`);
    });
  if (!tile.overhead && !tile.scroll) return { root };
  let seconds = 0;
  const tick = (dt: number, watchers: readonly Point[]) => {
    seconds += dt;
    if (tile.overhead) root.alpha = easeAlpha(root.alpha, roofAlpha(tile, watchers), dt);
    if (tile.scroll && view instanceof TilingSprite) {
      view.tilePosition.set(...scrollOffset(tile.scroll, seconds, tile.w, tile.h));
    }
  };
  return { root, tick };
}
