import type { Doc, DocRef, Patch } from '@vtt/core';
import {
  type BakeManifest,
  BakeManifestSchema,
  bakeFolder,
  type Chunk,
  intoPart,
  isGroup,
  partZ,
  type SceneLevel,
  type ScenePart,
  tileOrder,
  type WorldInfo,
} from '@vtt/shared';
import type { ClientMessage, ServerMessage } from '@vtt/system-dnd5e';
import { assetUrl } from '../assets.ts';
import { bakePlan, tilePrint } from '../canvas/bake-plan.ts';
import type { BakeJob } from '../canvas/scene-bake-job.ts';
import type { SessionPart } from './session-part.ts';

// The GM's Optimise and Edit for a 2D scene, as `session.bake`. Optimise
// draws the scene's still tiles into a picture pyramid in this browser
// (canvas/scene-bake-job.ts), saves it block by block in the game's assets
// and switches the scene to it (scene.json `bake`, `optimised`); Edit
// switches back to every tile drawn, keeping the bake. Everyone on an
// optimised scene loads its manifest and draws the pictures instead of the
// tiles in them (canvas/BakedGround.ts), but a tile changed since is drawn
// as it is now. A combined scene (scene-parts.ts in shared) draws the bake
// of each part where the part lies, and its Optimise bakes the parts that
// changed since their own bake.

type ChunkTile = Chunk['tiles'][number];

/** What the bake reads of the table. */
export interface BakeHost {
  readonly world?: WorldInfo;
  readonly scene: string;
  readonly docs: { all(coll: string): Doc[]; get(coll: string, id: string): Doc | undefined };
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
  /** The bakes the map draws: the scene's own and its parts', as each comes in. */
  private layers: Layer[] = [];
  /** The bakes asked for (`wanted`, as text), or '' for none. */
  private loaded = '';
  private pending = new Map<string, { resolve(): void; reject(e: Error): void }>();
  private sent = 0;
  private made = 0;
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

  /** The bakes an optimised scene draws: its own, and that of each part that has one. */
  private wanted(): Wanted[] {
    const world = this.s.world;
    if (!world?.optimised) return [];
    const own = world.bake ? [{ scene: this.s.scene, bake: world.bake }] : [];
    const parts = (world.parts ?? []).flatMap((part) => {
      const bake = world.partBakes?.[part.scene];
      return bake ? [{ scene: part.scene, bake, part }] : [];
    });
    return [...own, ...parts];
  }

  /** The scene is optimised (its bakes may still be loading). */
  get optimised(): boolean {
    return this.wanted().length > 0;
  }

  /** The bakes the map draws now, each with the folder its blocks are in and where it lies; none in edit mode or while they load. */
  get shown(): ShownBake[] {
    if (this.s.view3d.on || this.s.world?.view === '3d') return [];
    return this.layers.map(({ scene, bake, part, manifest }) => {
      const z = part ? partZ((this.s.world?.parts ?? []).findIndex((p) => p.scene === scene)) : 0;
      return { manifest, folder: `/assets/${bakeFolder(scene, bake)}`, x: part?.x ?? 0, y: part?.y ?? 0, z };
    });
  }

  /** Whether the map draws this tile from a bake: it is in it and unchanged since. */
  baked(tile: ChunkTile): boolean {
    if (!this.shown.length) return false;
    const layer = this.layers.find((l) => l.part?.scene === tile.part);
    if (!layer) return false;
    const own = layer.part ? intoPart('tiles', tile, layer.part) : tile;
    const print = layer.prints.get(own.id);
    return print !== undefined && print === tilePrint(own);
  }

  /** GM: how many baked tiles were changed or removed since the bake (Optimise again to take them in). */
  changedSince(): number {
    if (!this.shown.length) return 0;
    return this.layers.reduce((sum, layer) => {
      const now = new Map(this.tiles(layer.scene).map((t) => [t.id, tilePrint(t)]));
      return sum + [...layer.prints].filter(([id, print]) => now.get(id) !== print).length;
    }, 0);
  }

  welcome(): void {
    const wanted = this.wanted();
    const key = wanted.length ? JSON.stringify(wanted) : '';
    if (key === this.loaded) return;
    this.loaded = key;
    this.layers = [];
    this.shownChanged();
    for (const want of wanted) void this.load(want, key);
  }

  receive(msg: ServerMessage): boolean | undefined {
    if (msg.t === 'bakeSaved') this.settle(msg.ref);
    else if (msg.t === 'error' && msg.ref?.startsWith('bake-')) this.settle(msg.ref, msg.message);
    else return undefined;
    return false;
  }

  /** GM: bakes the scene you are on (and the parts of it that changed since their bake) and switches it to the bakes. */
  async optimise(): Promise<void> {
    if (!this.canOptimise || this.running) return;
    this.cancelled = false;
    this.progress({ step: 'load', done: 0, total: 0 });
    try {
      const baked = await this.bakeAll();
      if (baked?.length) this.on.updates('optimise scene', baked);
      else if (baked) this.s.showNotice('Nothing on this scene to optimise');
    } catch (e) {
      this.s.showError(`Could not optimise the scene: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.running = undefined;
      this.on.changed();
    }
  }

  /** Bakes the scene and its stale parts; the settings that switch each to its bake, or undefined when stopped. */
  private async bakeAll(): Promise<Switch[] | undefined> {
    const scene = this.s.scene;
    const parts = (this.s.world?.parts ?? []).map((p) => p.scene);
    const own = await this.bakeOne(scene);
    if (this.stopped()) return undefined;
    const out: Switch[] = own ? [switchTo(scene, own)] : [];
    for (const part of parts) {
      if (await this.fresh(part)) continue;
      const bake = await this.bakeOne(part);
      if (this.stopped()) return undefined;
      if (bake) out.push(switchTo(part, bake));
    }
    const laid = parts.some((p) => !!this.s.world?.partBakes?.[p] || out.some((o) => o.ref.id === p));
    return !own && laid ? [switchTo(scene, undefined), ...out] : out;
  }

  /** Draws and saves one scene's bake; its id, or undefined when the scene has nothing to bake (or it was stopped). */
  private async bakeOne(scene: string): Promise<string | undefined> {
    if (!this.tiles(scene).length) return undefined;
    const bake = `b${Date.now().toString(36)}${(++this.made).toString(36)}`;
    return (await this.tools.run(this.job(scene, bake))) ? bake : undefined;
  }

  /** Whether a part's last bake still holds every tile it would hold now, as they look now. */
  private async fresh(scene: string): Promise<boolean> {
    const bake = this.s.docs.get('scenes', scene)?.bake;
    if (typeof bake !== 'string') return false;
    const parsed = BakeManifestSchema.safeParse(await this.tools.read(scene, bake).catch(() => undefined));
    if (!parsed.success) return false;
    const then = parsed.data.groups.flatMap((g) => Object.entries(g.tiles));
    const now = bakePlan(this.tiles(scene), this.levels(scene)).flatMap((g) => g.tiles);
    const prints = new Map(then);
    return then.length === now.length && now.every((t) => prints.get(t.id) === tilePrint(t));
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
      tiles: this.tiles(scene),
      levels: this.levels(scene),
      ground: { gridSize: world?.gridSize ?? 100, chunkSize: world?.chunkSize ?? 2000 },
      put: (path, data) => this.put(scene, bake, path, data),
      progress: (step, done, total) => this.progress({ step, done, total }),
      cancelled: () => this.stopped(),
    };
  }

  /** A scene's floors: the scene you are on from the table, a part from its settings. */
  private levels(scene: string): readonly SceneLevel[] | undefined {
    if (scene === this.s.scene) return this.s.world?.levels;
    return this.s.docs.get('scenes', scene)?.levels as SceneLevel[] | undefined;
  }

  /** A scene's drawn tiles in draw order, as the map gets them. */
  private tiles(scene: string): ChunkTile[] {
    const drawn = tileOrder(this.s.docs.all(`${scene}/tiles`)).filter((d) => !isGroup(d));
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

  private async load(want: Wanted, key: string): Promise<void> {
    const read = await this.tools.read(want.scene, want.bake).catch(() => undefined);
    if (this.loaded !== key) return;
    const parsed = BakeManifestSchema.safeParse(read);
    if (!parsed.success) {
      console.warn(`The optimised scene's pictures are missing (${want.scene}/${want.bake})`);
      return;
    }
    const prints = new Map(parsed.data.groups.flatMap((g) => Object.entries(g.tiles)));
    this.layers = [...this.layers, { ...want, manifest: parsed.data, prints }];
    this.shownChanged();
  }

  private shownChanged(): void {
    this.version++;
    this.on.changed();
  }
}

/** A bake to draw: a scene's, and the part the scene is of the one you are on. */
interface Wanted {
  scene: string;
  bake: string;
  part?: ScenePart;
}

interface Layer extends Wanted {
  manifest: BakeManifest;
  /** The tiles in it, each with how it looked. */
  prints: Map<string, string>;
}

/** A bake on the map: its manifest, the folder of its blocks, and where its scene lies. */
export interface ShownBake {
  manifest: BakeManifest;
  folder: string;
  x: number;
  y: number;
  /** Where its scene's tiles start in the draw order: the picture lies just under them. */
  z: number;
}

interface Switch {
  ref: DocRef;
  patch: Patch;
}

/** The settings that switch a scene to a bake (or, with none of its own, to its parts' bakes). */
const switchTo = (scene: string, bake: string | undefined): Switch => ({
  ref: { coll: 'scenes', id: scene },
  patch: { ...(bake && { bake }), optimised: true },
});
