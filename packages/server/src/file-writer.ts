import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Writes JSON files in a folder: atomically (temp file + rename), one write
 * per file at a time, and remembering what it wrote so the folder watcher
 * can tell our own writes from edits made by hand.
 */
export class FileWriter {
  /** The last few texts written per file: a write can still be landing when the next one is queued. */
  private written = new Map<string, string[]>();
  private queues = new Map<string, Promise<void>>();

  constructor(readonly dir: string) {}

  /** True when `text` is what we last wrote to (or read from) `rel`. */
  isOurs(rel: string, text: string): boolean {
    return this.written.get(rel)?.includes(text) ?? false;
  }

  /** Remembers text read from disk, so the watcher doesn't reload it. */
  remember(rel: string, text: string): void {
    this.written.set(rel, [...(this.written.get(rel) ?? []), text].slice(-4));
  }

  write(rel: string, data: unknown): void {
    const text = `${JSON.stringify(data, null, 2)}\n`;
    if (this.written.get(rel)?.at(-1) === text) return;
    this.remember(rel, text);
    const path = join(this.dir, rel);
    this.queue(rel, async () => {
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      await writeFile(tmp, text);
      await rename(tmp, path);
    });
  }

  remove(rel: string): void {
    this.written.delete(rel);
    this.queue(rel, () => rm(join(this.dir, rel), { force: true }));
  }

  /** Resolves once every queued write has reached the disk. */
  async flush(): Promise<void> {
    await Promise.all(this.queues.values());
  }

  private queue(rel: string, job: () => Promise<void>): void {
    const prev = this.queues.get(rel) ?? Promise.resolve();
    const next = prev.then(job).catch((e: unknown) => console.error(`[game] failed to update ${rel}:`, e));
    this.queues.set(rel, next);
  }
}
