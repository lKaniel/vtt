import { mediaKind } from '@vtt/core';
import type { EditorMode, Point } from '@vtt/shared';
import {
  DEFAULT_LOOK,
  footprint,
  stampDoc,
  stampPoint,
  type StampAsset,
  type StampDoc,
  type StampLook,
} from '../editor/stamp.ts';
import type { EditorTool } from './session-editor.ts';
import { assetUrl } from '../assets.ts';
import { modelInfos } from '../view3d/model-thumbs.ts';
import { ModelPlans } from './model-plans.ts';

// The stamp brush's state, as `session.editor.stamp`: the picture or 3D model the GM
// picked up in the Assets tab, how it turns and sizes what it puts down, and
// what was picked up lately. The tiles mode's Stamp tool uses it; the brush on
// the map is canvas/StampBrush.ts and the arithmetic editor/stamp.ts.

/** What the brush needs of the session. */
export interface StampHost {
  readonly editor: {
    readonly mode: EditorMode;
    readonly tool: EditorTool;
    setMode(mode: EditorMode, tool?: EditorTool): void;
    setTool(tool: EditorTool): void;
  };
  readonly tiles: { stamp(docs: readonly StampDoc[]): void };
  gridSize(): number;
  /** The brush changed: the tools and the map redraw. */
  changed(): void;
  /** A picture's pixels, or a model's size in its own units (across, up, deep), once loaded. */
  measure?(asset: StampAsset): Promise<readonly number[] | undefined>;
  random?: () => number;
  /** Models drawn from above for the flat map (model-plans.ts). */
  readonly plans?: { of(src: string): Promise<string | undefined>; ready(src: string): string | undefined };
}

/** Where the look and the recent list are kept: this browser's storage, a Map in tests. */
export interface Kept {
  get(key: string): string | null | undefined;
  set(key: string, value: string): void;
}

const LOOK_KEY = 'vtt:stamp-look';
const RECENT_KEY = 'vtt:stamp-recent';
const RECENT = 12;
const TURN_STEP = 15;
const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
/** How long a model's stamp waits for its plan to be drawn and saved. */
const PLAN_WAIT_MS = 4000;

function read<T>(kept: Kept, key: string, fallback: T): T {
  try {
    const raw = kept.get(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** The stamp brush, as `session.editor.stamp`. */
export class Stamp {
  /** What the brush puts down. */
  asset?: StampAsset;
  look: StampLook;
  /** Picked up lately, newest first. */
  recent: StampAsset[];

  constructor(
    private readonly s: StampHost,
    private readonly kept: Kept,
  ) {
    this.look = { ...DEFAULT_LOOK, ...read<Partial<StampLook>>(kept, LOOK_KEY, {}) };
    this.recent = read<StampAsset[]>(kept, RECENT_KEY, []);
  }

  /** The brush is in hand: something picked up and the Stamp tool on. */
  get armed(): boolean {
    return !!this.asset && this.s.editor.mode === 'tiles' && this.s.editor.tool === 'stamp';
  }

  /** Picks `asset` up: the tiles mode's Stamp tool comes on. A model is measured first, so it stamps at its own size. */
  arm(asset: StampAsset): void {
    this.asset = asset;
    if (this.s.editor.mode === 'tiles') this.s.editor.setTool('stamp');
    else this.s.editor.setMode('tiles', 'stamp');
    this.remember(asset);
    if (!asset.size) void this.measure(asset);
    if (asset.kind === 'model') void this.s.plans?.of(asset.src).then(() => this.s.changed());
    this.s.changed();
  }

  private async measure(asset: StampAsset): Promise<void> {
    const size = await this.sizeOf(asset);
    if (!size || this.asset?.src !== asset.src) return;
    this.asset = { ...this.asset, size };
    this.recent = this.recent.map((r) => (r.src === asset.src ? { ...r, size } : r));
    this.s.changed();
  }

  private async sizeOf(asset: StampAsset): Promise<readonly number[] | undefined> {
    return asset.size ?? (await this.s.measure?.(asset).catch(() => undefined));
  }

  /**
   * A file dragged from the Assets tab and let go at `at`: one tile there,
   * at its own size and unturned (a model measured first).
   */
  drop(src: string, at: Point, size?: { w: number; h: number }): void {
    const kind = mediaKind(src);
    if (kind !== 'image' && kind !== 'video' && kind !== 'model') return;
    const asset: StampAsset = { src, kind, ...(size && { size: [size.w, size.h] }) };
    const put = (sized: StampAsset) =>
      this.s.tiles.stamp([
        this.planned(stampDoc(sized, DEFAULT_LOOK, at, { grid: this.s.gridSize(), random: () => 0 })),
      ]);
    if (asset.size && kind !== 'model') return put(asset);
    const plan = kind === 'model' ? this.s.plans?.of(src) : undefined;
    void Promise.all([this.sizeOf(asset), plan]).then(([known]) => put(known ? { ...asset, size: known } : asset));
  }

  /** A model tile shows the model's plan on the flat map once it is drawn (until then, nothing). */
  private planned(doc: StampDoc): StampDoc {
    const plan = doc.model && this.s.plans?.ready(doc.model.src);
    return plan ? { ...doc, src: plan } : doc;
  }

  private remember(asset: StampAsset): void {
    this.recent = [asset, ...this.recent.filter((r) => r.src !== asset.src)].slice(0, RECENT);
    this.keep(RECENT_KEY, this.recent);
  }

  setLook(patch: Partial<StampLook>): void {
    this.look = { ...this.look, ...patch };
    this.keep(LOOK_KEY, this.look);
    this.s.changed();
  }

  /** Q and E: turn by `deg` (a step by default). */
  turnBy(deg = TURN_STEP): void {
    this.setLook({ turn: (((this.look.turn + deg) % 360) + 360) % 360 });
  }

  /** - and =: times `factor`, kept between a tenth and ten times. */
  sizeBy(factor: number): void {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(this.look.scale * factor * 100) / 100));
    this.setLook({ scale });
  }

  /** Pixels between stamps a drag lays: the width of one, times the spacing. */
  spacing(): number {
    if (!this.asset) return this.s.gridSize();
    const { w, h } = footprint(this.asset, this.look, this.s.gridSize());
    return Math.max(8, Math.max(w, h) * this.look.spacing);
  }

  /** What one stamp at `at` puts down (the brush's ghost). */
  preview(at: Point, free: boolean): StampDoc | undefined {
    if (!this.asset) return undefined;
    const spot = stampPoint(at, this.s.gridSize(), free);
    return this.planned(stampDoc(this.asset, this.look, spot, { grid: this.s.gridSize(), random: () => 0 }));
  }

  /**
   * Stamps at `points`, as one undo step: one point (a click) snaps to half
   * squares unless `free`; a drag's points stay where they are.
   */
  place(points: readonly Point[], free: boolean): void {
    const asset = this.asset;
    if (!asset || !points.length) return;
    const grid = this.s.gridSize();
    const random = this.s.random ?? (() => Math.random());
    const spots = points.length === 1 ? [stampPoint(points[0]!, grid, free)] : points;
    const docs = spots.map((at) => stampDoc(asset, this.look, at, { grid, random }));
    const send = () => this.s.tiles.stamp(docs.map((d) => this.planned(d)));
    // A model's first stamps wait (a moment at most) for its plan, so they show on the flat map too.
    const plans = this.s.plans;
    if (asset.kind !== 'model' || !plans || plans.ready(asset.src)) return send();
    void Promise.race([plans.of(asset.src), new Promise((r) => setTimeout(r, PLAN_WAIT_MS))]).then(send);
  }

  private keep(key: string, value: unknown): void {
    try {
      this.kept.set(key, JSON.stringify(value));
    } catch {
      // A private window may refuse storage: the brush still works until reload.
    }
  }
}

/** This browser's storage (a private window may refuse it: the reads and writes above catch that). */
const browserKept: Kept = {
  get: (key) => localStorage.getItem(key),
  set: (key, value) => localStorage.setItem(key, value),
};

/** A picture's pixels, once loaded. */
function pictureSize(src: string): Promise<readonly number[] | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve([img.naturalWidth, img.naturalHeight]);
    img.onerror = () => resolve(undefined);
    img.src = assetUrl(src);
  });
}

/** A picture's pixels, or a model's size in its own units from its loaded file (view3d/model-thumbs.ts, loaded the first time). */
async function measureAsset(asset: StampAsset): Promise<readonly number[] | undefined> {
  if (asset.kind === 'image') return pictureSize(asset.src);
  if (asset.kind !== 'model' || !canDraw3d()) return undefined;
  return (await modelInfos().of(asset.src)).size;
}

/** Whether this page can draw 3D models (a browser with WebGL, not a test's DOM). */
const canDraw3d = (): boolean => typeof WebGLRenderingContext !== 'undefined';

/** What the table's brush is made from: the editor it sits in, the tiles, the game's files and the grid. */
interface BrushParts {
  editor: StampHost['editor'];
  tiles: StampHost['tiles'];
  packs: { readonly media: readonly { src: string }[]; upload(name: string, data: string): Promise<string> };
  gridSize(): number;
  changed(): void;
}

/** The table's stamp brush: models measured and drawn in this browser, the look kept in its storage. */
export function tableStamp(p: BrushParts): Stamp {
  const plans = new ModelPlans({
    media: () => p.packs.media,
    upload: (name, data) => p.packs.upload(name, data),
    render: async (src) => (canDraw3d() ? (await import('../view3d/thumb-render.ts')).renderPlan(src) : undefined),
  });
  return new Stamp({ ...p, measure: measureAsset, plans }, browserKept);
}
