import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { type ErrorEntry, type ErrorReport, logError } from '@vtt/shared';

// A game's error log (shared/error-log.ts) and the file it is kept in: the
// data folder's errors/<game>.json, outside the game folder so it never
// joins a backup, an export or the game's documents.

/** Hears each error logged (or counted again), and undefined when the log was cleared. */
type Listener = (entry: ErrorEntry | undefined) => void;

/** The error's name and text ("TypeError: x is undefined") and its stack. */
export function describeError(e: unknown): Pick<ErrorReport, 'message' | 'stack'> {
  if (e instanceof Error) return { message: `${e.name}: ${e.message}`, ...(e.stack && { stack: e.stack }) };
  return { message: String(e) };
}

export class ErrorLog {
  entries: ErrorEntry[] = [];
  private listeners = new Set<Listener>();
  private writing: Promise<void> = Promise.resolve();
  private dirty = false;

  /** `file`: where it is kept; none: only in memory (tests). */
  constructor(
    private readonly file?: string,
    private readonly now: () => number = Date.now,
  ) {}

  async load(): Promise<void> {
    if (!this.file) return;
    const text = await readFile(this.file, 'utf8').catch(() => '[]');
    try {
      const parsed: unknown = JSON.parse(text);
      this.entries = Array.isArray(parsed) ? (parsed as ErrorEntry[]) : [];
    } catch {
      this.entries = [];
    }
  }

  listen(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  add(report: ErrorReport): ErrorEntry {
    this.entries = logError(this.entries, report, this.now());
    const entry = this.entries.at(-1)!;
    this.changed(entry);
    return entry;
  }

  clear(): void {
    this.entries = [];
    this.changed(undefined);
  }

  /** Waits until the log is on disk. */
  async flush(): Promise<void> {
    await this.writing;
  }

  /** Writes the log straight away (the server is stopping on an error). */
  flushNow(): void {
    if (!this.file || !this.dirty) return;
    this.dirty = false;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.entries));
  }

  private changed(entry: ErrorEntry | undefined): void {
    for (const fn of this.listeners) fn(entry);
    this.save();
  }

  /** Writes the log after what is being written now; changes made meanwhile go in one write. */
  private save(): void {
    if (!this.file) return;
    const file = this.file;
    this.dirty = true;
    this.writing = this.writing
      .then(async () => {
        if (!this.dirty) return;
        this.dirty = false;
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, JSON.stringify(this.entries));
      })
      .catch((e: unknown) => console.error('[errors] could not keep the error log:', e));
  }
}
