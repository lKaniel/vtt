import { EventEmitter } from 'node:events';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FOG_BYTES, FogMap, undoFogBlock, type Raster } from '@vtt/shared';
import { FileWriter } from './file-writer.ts';

// Explored fog of war, per player per scene, kept by the server so it
// follows a player to another device and the GM can reset or paint it. It is
// saved beside the scene as scenes/<scene>/fog/<player>.json. Fog isn't a
// document: exploring happens on every step and isn't undone with the move,
// but the GM's own fog edits are, through `record` and `revert`.

/** One block a GM edit changed, for undo. */
export interface FogChange {
  scene: string;
  player: string;
  key: string;
  before: Uint8Array;
  after: Uint8Array;
}

interface FogEvents {
  /** These blocks of a player's fog on a scene changed; `full`: forget the rest. */
  fog: [scene: string, player: string, keys: string[], full: boolean];
}

const SAVE_DELAY_MS = 1000;
const slot = (scene: string, player: string) => `${scene}\u0000${player}`;
const fileOf = (scene: string, player: string) => `scenes/${scene}/fog/${player}.json`;

export class FogStore extends EventEmitter<FogEvents> {
  private maps = new Map<string, FogMap>();
  private unsaved = new Set<string>();
  private saveTimer?: NodeJS.Timeout;
  private files: FileWriter;
  /** The GM edit being recorded for undo. */
  private journal?: FogChange[];

  constructor(dir: string) {
    super();
    this.files = new FileWriter(dir);
  }

  /** Reads every saved fog file. A broken one is reported and starts over. */
  async load(scenes: readonly string[]): Promise<void> {
    for (const scene of scenes) {
      const names = await readdir(join(this.files.dir, `scenes/${scene}/fog`)).catch(() => [] as string[]);
      for (const name of names.filter((n) => n.endsWith('.json'))) await this.loadOne(scene, name.slice(0, -5));
    }
  }

  private async loadOne(scene: string, player: string): Promise<void> {
    const rel = fileOf(scene, player);
    try {
      const text = await readFile(join(this.files.dir, rel), 'utf8');
      this.maps.set(slot(scene, player), FogMap.decode(JSON.parse(text) as Parameters<typeof FogMap.decode>[0]));
      this.files.remember(rel, text);
    } catch (e) {
      console.error(`[game] ${rel} ignored: ${(e as Error).message}`);
    }
  }

  /** A player's fog on a scene with cells of `cell` pixels; a different grid starts it over. */
  map(scene: string, player: string, cell: number): FogMap {
    const key = slot(scene, player);
    let map = this.maps.get(key);
    if (map?.cell !== cell) {
      map = new FogMap(cell);
      this.maps.set(key, map);
    }
    return map;
  }

  /** Marks what a player's tokens see now as explored. */
  explore(scene: string, player: string, cell: number, rasters: readonly Raster[]): void {
    const map = this.map(scene, player, cell);
    const changed = new Set(rasters.flatMap((r) => map.add(r)));
    if (changed.size) this.changed(scene, player, [...changed], false);
  }

  /** GM: paints cells in or out for `players`, as an undoable edit. */
  paint(scene: string, players: readonly string[], cell: number, edit: { raster: Raster; reveal: boolean }): void {
    for (const player of players) {
      const map = this.map(scene, player, cell);
      const before = new Map(map.keys().map((k) => [k, map.block(k)]));
      const keys = edit.reveal ? map.add(edit.raster) : map.remove(edit.raster);
      this.note(scene, player, keys, (k) => before.get(k) ?? new Uint8Array(FOG_BYTES));
      if (keys.length) this.changed(scene, player, keys, false);
    }
  }

  /** GM: forgets everything `players` explored on a scene, as an undoable edit. */
  reset(scene: string, players: readonly string[], cell: number): void {
    for (const player of players) {
      const map = this.map(scene, player, cell);
      const keys = map.keys();
      const before = new Map(keys.map((k) => [k, map.block(k)]));
      for (const k of keys) map.setBlock(k, new Uint8Array(FOG_BYTES));
      this.note(scene, player, keys, (k) => before.get(k)!);
      this.changed(scene, player, keys, true);
    }
  }

  /** Runs `fn` and returns the GM fog edits it made. */
  record(fn: () => void): FogChange[] {
    if (this.journal) {
      fn();
      return [];
    }
    const journal: FogChange[] = [];
    this.journal = journal;
    try {
      fn();
    } finally {
      this.journal = undefined;
    }
    return journal;
  }

  /** Takes back (or makes again) recorded edits, keeping what was explored since. */
  revert(changes: readonly FogChange[], redo: boolean): void {
    const touched = new Map<string, { scene: string; player: string; keys: string[] }>();
    for (const c of changes) {
      const map = this.maps.get(slot(c.scene, c.player));
      if (!map) continue;
      const [from, to] = redo ? [c.after, c.before] : [c.before, c.after];
      map.setBlock(c.key, undoFogBlock(map.block(c.key), from, to));
      const t = touched.get(slot(c.scene, c.player)) ?? { scene: c.scene, player: c.player, keys: [] };
      t.keys.push(c.key);
      touched.set(slot(c.scene, c.player), t);
    }
    for (const t of touched.values()) this.changed(t.scene, t.player, t.keys, false);
  }

  /** Resolves once every change has reached the disk. */
  async flush(): Promise<void> {
    this.save();
    await this.files.flush();
  }

  private note(scene: string, player: string, keys: readonly string[], before: (key: string) => Uint8Array): void {
    const map = this.map(scene, player, this.maps.get(slot(scene, player))!.cell);
    for (const key of keys) this.journal?.push({ scene, player, key, before: before(key), after: map.block(key) });
  }

  private changed(scene: string, player: string, keys: string[], full: boolean): void {
    this.emit('fog', scene, player, keys, full);
    this.unsaved.add(slot(scene, player));
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), SAVE_DELAY_MS);
  }

  private save(): void {
    clearTimeout(this.saveTimer);
    for (const key of this.unsaved) {
      const [scene, player] = key.split('\u0000') as [string, string];
      const map = this.maps.get(key);
      if (map) this.files.write(fileOf(scene, player), map.encode());
    }
    this.unsaved.clear();
  }
}
