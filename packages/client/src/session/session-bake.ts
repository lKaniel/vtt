import type { Doc, DocRef, Patch } from '@vtt/core';
import {
  type BakeManifest,
  BakeManifestSchema,
  bakeFolder,
  type Chunk,
  isGroup,
  tileOrder,
  type WorldInfo,
} from '@vtt/shared';
import type { ClientMessage, ServerMessage } from '@vtt/system-dnd5e';
import { assetUrl } from '../assets.ts';
import { tilePrint } from '../canvas/bake-plan.ts';
import type { BakeJob } from '../canvas/scene-bake-job.ts';
import type { SessionPart } from './session-part.ts';

// The GM's Optimise and Edit for a 2D scene, as `session.bake`. Optimise
// draws the scene's still tiles into a picture pyramid in this browser
// (canvas/scene-bake-job.ts), saves it block by block in the game's assets
// and switches the scene to it (scene.json `bake`, `optimised`); Edit
// switches back to every tile drawn, keeping the bake. Everyone on an
// optimised scene loads its manifest and draws the pictures instead of the
// tiles in them (canvas/BakedGround.ts), but a tile changed since is drawn
// as it is now.

type ChunkTile = Chunk['tiles'][number];

/** What the bake reads of the table. */
export interface BakeHost {
  readonly world?: WorldInfo;
  readonly scene: string;
  readonly docs: { all(coll: string): Doc[] };
  readonly view3d: { readonly on: boolean };
  isGm(): boolean;
  send(msg: ClientMessage): void;
  showNotice(message: string): void;
  showError(message: string): void;
}

export interface BakeEvents {
  changed(): void;
  updates(label: string, updates: readonly { ref: DocRef; patch: Patch }[]): void;
}

/** How the bake reaches the files and the drawing: replaced in tests. */
export interface BakeTools {
  /** A bake's manifest. */
  read(scene: string, bake: string): Promise<unknown>;
  run(job: BakeJob): Promise<BakeManifest | undefined>;
}

const browserTools: BakeTools = {
  read: async (scene, bake): Promise<unknown> =>
    (await fetch(assetUrl(`/assets/${bakeFolder(scene, bake)}/manifest.json`))).json(),
  run: async (job) => (await import('../canvas/scene-bake-job.ts')).bakeScene(job),
};

/** How far an Optimise got. */
export interface BakeProgress {
  step: 'load' | 'draw';
  done: number;
  total: number;
}

export class SceneBake implements SessionPart {
  /** The Optimise under way. */
  running?: BakeProgress;
  /** Bumped whenever what the map draws from the bake changes. */
  version = 0;
  private manifest?: BakeManifest;
  /** The bake the manifest is of ("<scene>/<bake>"), or '' for none. */
  private loaded = '';
  private prints = new Map<string, string>();
  private pending = new Map<string, { resolve(): void; reject(e: Error): void }>();
  private sent = 0;
  private cancelled = false;

  constructor(
    private readonly s: BakeHost,
    private readonly on: BakeEvents,
    private readonly tools: BakeTools = browserTools,
  ) {}

  /** The GM may optimise this scene: a flat one. */
  get canOptimise(): boolean {
    return this.s.isGm() && this.s.world?.view !== '3d';
  }

  /** The scene is optimised (its bake may still be loading). */
  get optimised(): boolean {
    return !!this.s.world?.optimised && !!this.s.world.bake;
  }

  /** The bake the map draws now, and the folder its blocks are in; undefined in edit mode or while it loads. */
  get shown(): { manifest: BakeManifest; folder: string } | undefined {
    if (!this.manifest || !this.optimised || this.s.view3d.on || this.s.world?.view === '3d') return undefined;
    return { manifest: this.manifest, folder: `/assets/${bakeFolder(this.s.scene, this.s.world!.bake!)}` };
  }

  /** Whether the map draws this tile from the bake: it is in it and unchanged since. */
  baked(tile: ChunkTile): boolean {
    if (!this.shown) return false;
    const print = this.prints.get(tile.id);
    return print !== undefined && print === tilePrint(tile);
  }

  /** GM: how many baked tiles were changed or removed since the bake (Optimise again to take them in). */
  changedSince(): number {
    if (!this.shown) return 0;
    const now = new Map(this.tiles().map((t) => [t.id, tilePrint(t)]));
    return [...this.prints].filter(([id, print]) => now.get(id) !== print).length;
  }

  welcome(): void {
    const bake = this.s.world?.bake;
    const want = this.optimised ? `${this.s.scene}/${bake}` : '';
    if (want === this.loaded) return;
    this.loaded = want;
    this.use(undefined);
    if (want) void this.load(this.s.scene, bake!, want);
  }

  receive(msg: ServerMessage): boolean | undefined {
    if (msg.t === 'bakeSaved') this.settle(msg.ref);
    else if (msg.t === 'error' && msg.ref?.startsWith('bake-')) this.settle(msg.ref, msg.message);
    else return undefined;
    return false;
  }

  /** GM: bakes the scene you are on and switches it to the bake. */
  async optimise(): Promise<void> {
    if (!this.canOptimise || this.running) return;
    const scene = this.s.scene;
    const bake = `b${Date.now().toString(36)}`;
    this.cancelled = false;
    this.progress({ step: 'load', done: 0, total: 0 });
    try {
      const manifest = await this.tools.run(this.job(scene, bake));
      if (manifest)
        this.on.updates('optimise scene', [{ ref: { coll: 'scenes', id: scene }, patch: { bake, optimised: true } }]);
      else if (!this.stopped()) this.s.showNotice('Nothing on this scene to optimise');
    } catch (e) {
      this.s.showError(`Could not optimise the scene: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.running = undefined;
      this.on.changed();
    }
  }

  /** GM: stops an Optimise under way; the scene stays as it was. */
  // fallow-ignore-next-line unused-class-member -- ui/OptimiseButton.tsx calls it; fallow misses that use
  cancel(): void {
    this.cancelled = true;
  }

  private stopped(): boolean {
    return this.cancelled;
  }

  /** GM: back to every tile drawn, to edit the scene; the bake is kept until the next Optimise. */
  edit(): void {
    this.on.updates('edit scene', [{ ref: { coll: 'scenes', id: this.s.scene }, patch: { optimised: null } }]);
  }

  private job(scene: string, bake: string): BakeJob {
    const world = this.s.world;
    return {
      tiles: this.tiles(),
      levels: world?.levels,
      ground: { gridSize: world?.gridSize ?? 100, chunkSize: world?.chunkSize ?? 2000 },
      put: (path, data) => this.put(scene, bake, path, data),
      progress: (step, done, total) => this.progress({ step, done, total }),
      cancelled: () => this.stopped(),
    };
  }

  /** The scene's drawn tiles in draw order, as the map gets them. */
  private tiles(): ChunkTile[] {
    const drawn = tileOrder(this.s.docs.all(`${this.s.scene}/tiles`)).filter((d) => !isGroup(d));
    return drawn.map(({ type: _t, rev: _r, ...tile }, z) => ({ ...(tile as unknown as ChunkTile), z }));
  }

  private put(scene: string, bake: string, path: string, data: string): Promise<void> {
    const ref = `bake-${++this.sent}`;
    const saved = new Promise<void>((resolve, reject) => this.pending.set(ref, { resolve, reject }));
    this.s.send({ t: 'bakeBlock', scene, bake, path, data, ref });
    return saved;
  }

  private settle(ref: string, error?: string): void {
    const waiting = this.pending.get(ref);
    this.pending.delete(ref);
    if (error) waiting?.reject(new Error(error));
    else waiting?.resolve();
  }

  /** Shows how far it got, a step at a time so the screen isn't redrawn for every block. */
  private progress(next: BakeProgress): void {
    const pct = (p?: BakeProgress) => (p?.total ? Math.floor((p.done / p.total) * 50) : 0);
    const moved = this.running?.step !== next.step || pct(this.running) !== pct(next);
    this.running = next;
    if (moved) this.on.changed();
  }

  private async load(scene: string, bake: string, key: string): Promise<void> {
    const read = await this.tools.read(scene, bake).catch(() => undefined);
    if (this.loaded !== key) return;
    const parsed = BakeManifestSchema.safeParse(read);
    if (!parsed.success) console.warn(`The optimised scene's pictures are missing (${key})`);
    this.use(parsed.data);
  }

  private use(manifest: BakeManifest | undefined): void {
    this.manifest = manifest;
    this.prints = new Map(manifest?.groups.flatMap((g) => Object.entries(g.tiles)) ?? []);
    this.version++;
    this.on.changed();
  }
}
