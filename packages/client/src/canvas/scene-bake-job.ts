import {
  BAKE_BLOCK,
  type BakeGroup,
  bakeBlocksOver,
  type BakeManifest,
  bakePath,
  bakeSpan,
  bakeTopScale,
  bakeZooms,
  type Chunk,
  type Rect,
  type SceneLevel,
} from '@vtt/shared';
import { autoDetectRenderer, Container, Matrix, type Renderer, RenderTexture } from 'pixi.js';
import { type GroundContext, rectTile } from './art/ground.ts';
import { bakePlan, type PlannedGroup, tilePrint } from './bake-plan.ts';
import { overlaps, tileBounds, tilePad } from './tile-bake.ts';
import { imageTile } from './tile-draw.ts';

// The GM's Optimise: draws a scene's still tiles (bake-plan.ts) floor by
// floor into a picture pyramid (scene-bake.ts in shared) and hands each
// block to `put`, the manifest last. Zoom 0 is drawn by Pixi with the same
// code that draws the tiles on the map; every coarser block is its four
// children shrunk, built depth first so only a few blocks are held at once.

type ChunkTile = Chunk['tiles'][number];

export interface BakeJob {
  /** The scene's drawn tiles in draw order (`z`). */
  tiles: readonly ChunkTile[];
  levels: readonly SceneLevel[] | undefined;
  ground: GroundContext;
  /** Saves one file of the bake (base64); the manifest comes last. */
  put(path: string, data: string): Promise<void>;
  /** How far it got: pictures loaded, then blocks drawn, out of how many. */
  progress(step: 'load' | 'draw', done: number, total: number): void;
  cancelled(): boolean;
}

/** Uploads at once while the next blocks are drawn. */
const IN_FLIGHT = 4;
const QUALITY = 0.85;

interface Piece {
  root: Container;
  bounds: Rect;
}

/** Runs the bake; the manifest, or undefined when there was nothing to bake or it was cancelled. */
export async function bakeScene(job: BakeJob): Promise<BakeManifest | undefined> {
  const plan = bakePlan(job.tiles, job.levels);
  if (!plan.length) return undefined;
  const renderer = await autoDetectRenderer({
    preference: 'webgl',
    width: BAKE_BLOCK,
    height: BAKE_BLOCK,
    backgroundAlpha: 0,
  });
  try {
    const scale = bakeTopScale(plan.slice(1).reduce((all, g) => union(all, g.bounds), plan[0]!.bounds));
    const ext = webpWorks() ? 'webp' : 'png';
    const groups: BakeGroup[] = [];
    for (const [i, group] of plan.entries()) {
      const baked = await new GroupBake(job, renderer, { index: i, scale, ext }).run(group);
      if (!baked) return undefined;
      groups.push(baked);
    }
    const manifest: BakeManifest = { v: 1, block: BAKE_BLOCK, scale, ext, groups };
    await job.put('manifest.json', btoa(JSON.stringify(manifest)));
    return manifest;
  } finally {
    renderer.destroy();
  }
}

function union(a: Rect, b: Rect): Rect {
  const [x, y] = [Math.min(a.x, b.x), Math.min(a.y, b.y)];
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** Whether this browser writes WebP (Safari writes PNG instead). */
function webpWorks(): boolean {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  return canvas.toDataURL('image/webp').startsWith('data:image/webp');
}

/** One floor's pyramid. */
class GroupBake {
  private readonly stage = new Container();
  private pieces: Piece[] = [];
  private area: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private zooms = 1;
  private target = RenderTexture.create({ width: BAKE_BLOCK, height: BAKE_BLOCK });
  private blocks: Set<string>[] = [];
  private uploads = new Set<Promise<void>>();
  private drawn = 0;
  private toDraw = 0;

  constructor(
    private readonly job: BakeJob,
    private readonly renderer: Renderer,
    private readonly at: { index: number; scale: number; ext: string },
  ) {}

  async run(group: PlannedGroup): Promise<BakeGroup | undefined> {
    try {
      this.area = group.bounds;
      this.zooms = bakeZooms(this.area, this.at.scale);
      this.blocks = Array.from({ length: this.zooms }, () => new Set<string>());
      await this.load(group.tiles);
      this.toDraw = this.topBlocks().size;
      await this.block(this.zooms - 1, 0, 0);
      await Promise.all(this.uploads);
      if (this.job.cancelled()) return undefined;
      const tiles = Object.fromEntries(group.tiles.map((t) => [t.id, tilePrint(t)]));
      const blocks = this.blocks.map((set) => [...set]);
      return { ...(group.level && { level: group.level }), ...this.area, zooms: this.zooms, tiles, blocks };
    } finally {
      this.stage.destroy({ children: true });
      this.target.destroy(true);
    }
  }

  /** Draws every tile off screen and waits for their pictures. */
  private async load(tiles: readonly ChunkTile[]): Promise<void> {
    let done = 0;
    const waits = tiles.map((tile) => {
      const view = tile.kind === 'rect' ? rectTile(tile, this.job.ground) : imageTile(tile);
      this.stage.addChild(view.root);
      this.pieces.push({ root: view.root, bounds: tileBounds(tile, tilePad(tile)) });
      return Promise.resolve(view.loaded).then(() => this.job.progress('load', ++done, tiles.length));
    });
    await Promise.all(waits);
  }

  /** The zoom-0 blocks some tile lies on. */
  private topBlocks(): Set<string> {
    const keys = new Set<string>();
    for (const p of this.pieces)
      for (const [x, y] of bakeBlocksOver(this.area, this.at.scale, 0, p.bounds)) keys.add(`${x}_${y}`);
    return keys;
  }

  private blockRect(zoom: number, x: number, y: number): Rect {
    const span = bakeSpan(this.at.scale, zoom);
    return { x: this.area.x + x * span, y: this.area.y + y * span, w: span, h: span };
  }

  /** Block `[x, y]` of `zoom` drawn and saved; undefined when nothing is in it. */
  private async block(zoom: number, x: number, y: number): Promise<HTMLCanvasElement | undefined> {
    if (this.job.cancelled()) return undefined;
    const rect = this.blockRect(zoom, x, y);
    if (!this.pieces.some((p) => overlaps(p.bounds, rect))) return undefined;
    const canvas = zoom === 0 ? this.draw(rect) : await this.shrink(zoom, x, y);
    if (!canvas) return undefined;
    await this.save(zoom, x, y, canvas);
    return canvas;
  }

  /** A zoom-0 block, drawn by Pixi; undefined when it came out empty. */
  private draw(rect: Rect): HTMLCanvasElement | undefined {
    for (const p of this.pieces) p.root.visible = overlaps(p.bounds, rect);
    const s = this.at.scale;
    const transform = new Matrix(s, 0, 0, s, -rect.x * s, -rect.y * s);
    this.renderer.render({ container: this.stage, target: this.target, clear: true, transform });
    const canvas = this.renderer.extract.canvas(this.target) as HTMLCanvasElement;
    this.job.progress('draw', ++this.drawn, this.toDraw);
    return empty(canvas) ? undefined : canvas;
  }

  /** A coarser block: its four children, each shrunk to a quarter. */
  private async shrink(zoom: number, x: number, y: number): Promise<HTMLCanvasElement | undefined> {
    const half = BAKE_BLOCK / 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = BAKE_BLOCK;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    let any = false;
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      const child = await this.block(zoom - 1, 2 * x + dx, 2 * y + dy);
      if (!child) continue;
      ctx.drawImage(child, dx * half, dy * half, half, half);
      any = true;
    }
    return any ? canvas : undefined;
  }

  /** Encodes a block and sends it, a few at a time. */
  private async save(zoom: number, x: number, y: number, canvas: HTMLCanvasElement): Promise<void> {
    this.blocks[zoom]!.add(`${x}_${y}`);
    const path = bakePath(this.at.index, zoom, [x, y], this.at.ext);
    const upload = encode(canvas, this.at.ext).then((data) => this.job.put(path, data));
    this.uploads.add(upload);
    void upload.finally(() => this.uploads.delete(upload));
    if (this.uploads.size >= IN_FLIGHT) await Promise.race(this.uploads);
  }
}

/** Whether every pixel is see-through. */
function empty(canvas: HTMLCanvasElement): boolean {
  const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i]) return false;
  return true;
}

/** The canvas as a picture file, in base64. */
async function encode(canvas: HTMLCanvasElement, ext: string): Promise<string> {
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, `image/${ext}`, QUALITY));
  if (!blob) throw new Error('The browser could not save a block of the scene');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
