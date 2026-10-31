import { chunkRect, chunksInRect, type Rect } from '@vtt/shared';
import { Container, Matrix, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';

/** Texels along a chunk's side: about 8 map pixels each with the default chunk size. */
const TEXELS = 256;
const SAVE_DELAY_MS = 2000;

interface Page {
  rt: RenderTexture;
  sprite: Sprite;
}

/**
 * Where a player has been: the outline of everything their tokens have seen,
 * painted into one small texture per map chunk and kept in the browser per
 * world and player. Unlike squares, it follows walls and light exactly.
 */
export class FogMemory {
  /** Every page, laid out in map pixels, drawn white where explored. */
  readonly layer = new Container();
  private pages = new Map<string, Page>();
  private unsaved = new Set<string>();
  private saveTimer?: ReturnType<typeof setTimeout>;
  private prefix = '';

  constructor(
    private renderer: Renderer,
    private chunkSize: () => number,
  ) {}

  /** Switches to another world or player's memory. */
  load(prefix: string): void {
    this.flush();
    for (const page of this.pages.values()) page.rt.destroy(true);
    this.pages.clear();
    this.layer.removeChildren();
    this.prefix = prefix;
  }

  /** Makes sure the pages under `view` exist, restoring them from storage. */
  show(view: Rect): void {
    for (const key of chunksInRect(view, this.chunkSize())) this.page(key);
  }

  /**
   * Paints `shape` (in map pixels, white) into the pages under `bounds`
   * whose walls are `known`: sight worked out without them can't be trusted.
   */
  stamp(shape: Container, bounds: Rect, known: (chunk: string) => boolean): void {
    const size = this.chunkSize();
    for (const key of chunksInRect(bounds, size)) {
      if (!known(key)) continue;
      const rect = chunkRect(key, size)!;
      const k = TEXELS / size;
      const transform = new Matrix(k, 0, 0, k, -rect.x * k, -rect.y * k);
      this.renderer.render({ container: shape, target: this.page(key).rt, clear: false, transform });
      this.unsaved.add(key);
    }
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
  }

  destroy(): void {
    this.flush();
    this.layer.destroy({ children: true });
    for (const page of this.pages.values()) page.rt.destroy(true);
  }

  private page(key: string): Page {
    let page = this.pages.get(key);
    if (page) return page;
    const size = this.chunkSize();
    const rect = chunkRect(key, size)!;
    const rt = RenderTexture.create({ width: TEXELS, height: TEXELS });
    this.renderer.render({ container: new Container(), target: rt, clear: true });
    const sprite = new Sprite(rt);
    sprite.position.set(rect.x, rect.y);
    sprite.scale.set(size / TEXELS);
    this.layer.addChild(sprite);
    page = { rt, sprite };
    this.pages.set(key, page);
    this.restore(key, rt);
    return page;
  }

  private restore(key: string, rt: RenderTexture): void {
    const data = readStorage(`${this.prefix}:${key}`);
    if (!data) return;
    const img = new Image();
    img.src = data;
    void img
      .decode()
      .then(() => {
        if (rt.destroyed) return;
        const texture = Texture.from(img);
        const saved = new Sprite(texture);
        saved.width = saved.height = TEXELS;
        this.renderer.render({ container: saved, target: rt, clear: false });
        saved.destroy();
        texture.destroy(true);
      })
      .catch(() => {
        // A broken saved page just means exploring that chunk again.
      });
  }

  private flush(): void {
    clearTimeout(this.saveTimer);
    for (const key of this.unsaved) {
      const page = this.pages.get(key);
      if (!page) continue;
      void this.renderer.extract
        .base64({ target: page.rt, format: 'webp', quality: 0.9 })
        .then((data) => writeStorage(`${this.prefix}:${key}`, data));
    }
    this.unsaved.clear();
  }
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full or blocked: exploration just won't survive a reload.
  }
}
