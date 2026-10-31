import type { Tile, TileTexture } from '@vtt/shared';
import { Container, Graphics, Texture, TilingSprite } from 'pixi.js';
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

/** A rect tile: flat colour, or painted ground tinted by its colour, with straight or wobbly edges. */
export function rectTile(tile: RectTile, ctx: GroundContext): Container {
  const rough = tile.edge ? tile.edge === 'rough' : !!tile.texture && NATURAL.includes(tile.texture);
  const m = rough ? MARGIN : 0;
  const body = tile.texture
    ? texturedRect(tile, tile.texture, m, ctx)
    : new Graphics().rect(tile.x - m, tile.y - m, tile.w + 2 * m, tile.h + 2 * m).fill(tile.color);
  if (!rough) return body;
  const holder = new Container();
  const mask = new Graphics().poly(roughOutline(tile, ctx.chunkSize)).fill(0xffffff);
  holder.addChild(body, mask);
  holder.mask = mask;
  return holder;
}

function texturedRect(tile: RectTile, kind: TileTexture, m: number, ctx: GroundContext): TilingSprite {
  const sprite = new TilingSprite({ texture: groundTexture(kind), width: tile.w + 2 * m, height: tile.h + 2 * m });
  sprite.position.set(tile.x - m, tile.y - m);
  sprite.tileScale.set(((tile.textureScale ?? 2) * ctx.gridSize) / SIZE);
  // Line the texture up with the map's origin, so neighbouring tiles continue it.
  sprite.tilePosition.set(-(tile.x - m), -(tile.y - m));
  sprite.tint = parseColor(tile.color, 0xffffff);
  return sprite;
}
