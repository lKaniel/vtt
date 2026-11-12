import type { Tile, TileTexture } from '@vtt/shared';
import { Assets, Container, Graphics, Texture, TilingSprite } from 'pixi.js';
import { assetUrl } from '../../assets.ts';
import { parseColor } from '../lighting/light-style.ts';
import { roughOutline } from './rough-edge.ts';
import { paintTexture } from './texture-paint.ts';

const SIZE = 256;
/** Rough edges stray this far past the tile, so its texture is drawn a little larger. */
const MARGIN = 16;
const NATURAL: readonly TileTexture[] = ['grass', 'dirt', 'sand', 'water', 'rock'];
const textures = new Map<TileTexture, Texture>();

/** The painted texture for a kind of ground, made once. */
function groundTexture(kind: TileTexture): Texture {
  let tex = textures.get(kind);
  if (tex) return tex;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  canvas.getContext('2d')!.putImageData(new ImageData(paintTexture(kind, SIZE), SIZE), 0, 0);
  tex = Texture.from(canvas);
  textures.set(kind, tex);
  return tex;
}

type RectTile = Extract<Tile, { kind: 'rect' }>;

export interface GroundContext {
  gridSize: number;
  chunkSize: number;
}

/** A drawn rect tile; `loaded` settles once a pattern's picture is in. */
export interface RectView {
  root: Container;
  loaded?: Promise<void>;
}

/** A rect tile: flat colour, painted ground or a repeated picture tinted by its colour, with straight or wobbly edges. */
export function rectTile(tile: RectTile, ctx: GroundContext): RectView {
  const natural = !!tile.texture && NATURAL.includes(tile.texture);
  const rough = tile.edge ? tile.edge === 'rough' : natural;
  const m = rough ? MARGIN : 0;
  const { body, loaded } = bodyOf(tile, m, ctx);
  if (!rough) return { root: body, loaded };
  const holder = new Container();
  const mask = new Graphics().poly(roughOutline(tile, ctx.chunkSize)).fill(0xffffff);
  holder.addChild(body, mask);
  holder.mask = mask;
  return { root: holder, loaded };
}

function bodyOf(tile: RectTile, m: number, ctx: GroundContext): { body: Container; loaded?: Promise<void> } {
  if (tile.pattern) return patternRect(tile, tile.pattern, m, ctx);
  if (tile.texture) return { body: texturedRect(tile, { tex: groundTexture(tile.texture), size: SIZE }, m, ctx) };
  return { body: new Graphics().rect(tile.x - m, tile.y - m, tile.w + 2 * m, tile.h + 2 * m).fill(tile.color) };
}

/** A rect repeating a picture, drawn in its colour until the picture is in. */
function patternRect(tile: RectTile, src: string, m: number, ctx: GroundContext) {
  const body = new Container();
  const fill = body.addChild(
    new Graphics().rect(tile.x - m, tile.y - m, tile.w + 2 * m, tile.h + 2 * m).fill(tile.color),
  );
  const loaded = Assets.load<Texture>(assetUrl(src))
    .then((tex) => {
      if (body.destroyed) return;
      body.addChild(texturedRect(tile, { tex, size: tex.width }, m, ctx));
      fill.destroy();
    })
    .catch(() => console.warn(`Missing pattern ${src}`));
  return { body, loaded };
}

/** `size`: the texture's width in pixels, which `textureScale` squares cover. */
function texturedRect(
  tile: RectTile,
  { tex, size }: { tex: Texture; size: number },
  m: number,
  ctx: GroundContext,
): TilingSprite {
  const sprite = new TilingSprite({ texture: tex, width: tile.w + 2 * m, height: tile.h + 2 * m });
  sprite.position.set(tile.x - m, tile.y - m);
  sprite.tileScale.set(((tile.textureScale ?? 2) * ctx.gridSize) / size);
  // Line the texture up with the map's origin, so neighbouring tiles continue it.
  sprite.tilePosition.set(-(tile.x - m), -(tile.y - m));
  sprite.tint = parseColor(tile.color, 0xffffff);
  return sprite;
}
