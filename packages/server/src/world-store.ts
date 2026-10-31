import { EventEmitter } from 'node:events';
import { watch, type FSWatcher } from 'node:fs';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import {
  chunksInRect,
  tokenLights,
  type Chunk,
  type LightSource,
  type Point,
  type Rect,
  type Token,
  type Wall,
  type World,
} from '@vtt/shared';
import { classify, crossCheck, parseFile, type FileKind } from './files.ts';

interface StoreEvents {
  world: [World];
  chunk: [string, Chunk];
  chunkGone: [string];
  /** `path` is set when the token walked there inside the game. */
  token: [Token, Point[] | undefined];
  tokenGone: [string];
}

/**
 * The world folder, held in memory. The folder is the source of truth:
 * edits made by hand or by Claude are picked up live, and changes made in the
 * game are written back as soon as they happen.
 */
export class WorldStore extends EventEmitter<StoreEvents> {
  world!: World;
  readonly chunks = new Map<string, Chunk>();
  readonly tokens = new Map<string, Token>();

  /** Text we last wrote per file, so our own writes don't echo back as edits. */
  private written = new Map<string, string>();
  private writeQueue = new Map<string, Promise<void>>();
  private pending = new Map<string, NodeJS.Timeout>();
  private watcher?: FSWatcher;

  constructor(readonly dir: string) {
    super();
  }

  async load(): Promise<void> {
    const result = parseFile({ kind: 'world' }, await readFile(join(this.dir, 'world.json'), 'utf8'));
    if (result.file?.kind !== 'world') {
      throw new Error(`world.json is invalid:\n  ${result.errors.join('\n  ')}`);
    }
    this.world = result.file.data;
    for (const sub of ['chunks', 'tokens']) {
      await mkdir(join(this.dir, sub), { recursive: true });
      for (const name of await readdir(join(this.dir, sub))) {
        const rel = `${sub}/${name}`;
        const kind = classify(rel);
        if (kind) await this.loadFile(rel, kind, false);
      }
    }
    for (const issue of crossCheck(this.world, this.chunks, this.tokens)) {
      console.warn(`[world] ${issue.file}: ${issue.message}`);
    }
    console.log(`[world] loaded "${this.world.name}": ${this.chunks.size} chunks, ${this.tokens.size} tokens`);
  }

  watch(): void {
    this.watcher = watch(this.dir, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const rel = filename.split('\\').join('/');
      if (!classify(rel)) return;
      // Editors often write a file in several steps; wait for it to settle.
      clearTimeout(this.pending.get(rel));
      this.pending.set(
        rel,
        setTimeout(() => void this.onFileChanged(rel), 80),
      );
    });
  }

  close(): void {
    this.watcher?.close();
    for (const t of this.pending.values()) clearTimeout(t);
  }

  wallsIn(rect: Rect): Wall[] {
    const walls: Wall[] = [];
    for (const key of chunksInRect(rect, this.world.chunkSize)) {
      const c = this.chunks.get(key);
      if (c) walls.push(...c.walls);
    }
    return walls;
  }

  wallsBetween(a: Point, b: Point): Wall[] {
    return this.wallsIn({
      x: Math.min(a[0], b[0]) - 1,
      y: Math.min(a[1], b[1]) - 1,
      w: Math.abs(a[0] - b[0]) + 2,
      h: Math.abs(a[1] - b[1]) + 2,
    });
  }

  /** Every light in the world: placed in chunks and carried by tokens. */
  lights(): LightSource[] {
    const out: LightSource[] = [];
    for (const c of this.chunks.values()) out.push(...c.lights);
    out.push(...tokenLights(this.tokens.values()));
    return out;
  }

  setToken(token: Token, path?: Point[]): void {
    this.tokens.set(token.id, token);
    this.emit('token', token, path);
    this.write(`tokens/${token.id}.json`, token);
  }

  setChunk(key: string, chunk: Chunk): void {
    this.chunks.set(key, chunk);
    this.emit('chunk', key, chunk);
    this.write(`chunks/${key}.json`, chunk);
  }

  private async onFileChanged(rel: string): Promise<void> {
    this.pending.delete(rel);
    const kind = classify(rel)!;
    let text: string;
    try {
      text = await readFile(join(this.dir, rel), 'utf8');
    } catch {
      this.written.delete(rel);
      if (kind.kind === 'chunk' && this.chunks.delete(kind.key)) this.emit('chunkGone', kind.key);
      if (kind.kind === 'token' && this.tokens.delete(kind.id)) this.emit('tokenGone', kind.id);
      return;
    }
    if (this.written.get(rel) === text) return;
    console.log(`[world] reloading ${rel}`);
    this.applyText(rel, kind, text, true);
  }

  private async loadFile(rel: string, kind: FileKind, live: boolean): Promise<void> {
    this.applyText(rel, kind, await readFile(join(this.dir, rel), 'utf8'), live);
  }

  private applyText(rel: string, kind: FileKind, text: string, live: boolean): void {
    const { file, errors } = parseFile(kind, text);
    if (!file) {
      console.error(`[world] ${rel} ignored:\n  ${errors.join('\n  ')}`);
      return;
    }
    this.written.set(rel, text);
    switch (file.kind) {
      case 'world':
        this.world = file.data;
        if (live) this.emit('world', file.data);
        break;
      case 'chunk':
        this.chunks.set(file.key, file.data);
        if (live) this.emit('chunk', file.key, file.data);
        break;
      case 'token':
        this.tokens.set(file.id, file.data);
        if (live) this.emit('token', file.data, undefined);
        break;
    }
  }

  /** Writes atomically (temp file + rename) and one write per file at a time. */
  private write(rel: string, data: unknown): void {
    const text = `${JSON.stringify(data, null, 2)}\n`;
    this.written.set(rel, text);
    const path = join(this.dir, rel);
    const prev = this.writeQueue.get(rel) ?? Promise.resolve();
    const next = prev
      .then(async () => {
        await mkdir(dirname(path), { recursive: true });
        const tmp = `${path}.${process.pid}.tmp`;
        await writeFile(tmp, text);
        await rename(tmp, path);
      })
      .catch((e: unknown) => console.error(`[world] failed to write ${relative(this.dir, path)}:`, e));
    this.writeQueue.set(rel, next);
  }

  /** Resolves once every queued write has reached the disk. */
  async flush(): Promise<void> {
    await Promise.all(this.writeQueue.values());
  }
}
