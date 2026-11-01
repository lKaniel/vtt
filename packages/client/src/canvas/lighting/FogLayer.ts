import { FOG_BLOCK, type FogMap } from '@vtt/shared';
import { Container, Sprite, Texture } from 'pixi.js';

interface Page {
  bytes: Uint8Array;
  sprite: Sprite;
}

/**
 * Explored ground, as the server keeps it (see fog.ts): one small texture
 * per fog block, white where explored, scaled up with smoothing so its edges
 * are soft. Only blocks that changed are drawn again.
 */
export class FogLayer {
  readonly layer = new Container();
  private pages = new Map<string, Page>();
  private cell = 0;

  /** Shows `map` (nothing when undefined). */
  show(map: FogMap | undefined): void {
    if (map?.cell !== this.cell) this.clear();
    if (!map) return;
    this.cell = map.cell;
    const keys = new Set(map.keys());
    for (const key of [...this.pages.keys()]) if (!keys.has(key)) this.drop(key);
    for (const key of keys) this.draw(key, map.block(key));
  }

  destroy(): void {
    this.clear();
    this.layer.destroy({ children: true });
  }

  private clear(): void {
    for (const key of [...this.pages.keys()]) this.drop(key);
    this.cell = 0;
  }

  private drop(key: string): void {
    const page = this.pages.get(key);
    if (!page) return;
    page.sprite.destroy({ texture: true, textureSource: true });
    this.pages.delete(key);
  }

  private draw(key: string, bytes: Uint8Array): void {
    const page = this.pages.get(key);
    if (page?.bytes.every((b, i) => b === bytes[i])) return;
    this.drop(key);
    const [bx, by] = key.split('_').map(Number) as [number, number];
    const sprite = new Sprite(blockTexture(bytes));
    sprite.position.set(bx * FOG_BLOCK * this.cell, by * FOG_BLOCK * this.cell);
    sprite.scale.set(this.cell);
    this.layer.addChild(sprite);
    this.pages.set(key, { bytes, sprite });
  }
}

function blockTexture(bytes: Uint8Array): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = FOG_BLOCK;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(FOG_BLOCK, FOG_BLOCK);
  for (let i = 0; i < FOG_BLOCK * FOG_BLOCK; i++) {
    if (!(bytes[i >> 3]! & (1 << (i & 7)))) continue;
    image.data.set([255, 255, 255, 255], i * 4);
  }
  ctx.putImageData(image, 0, 0);
  return Texture.from(canvas);
}
