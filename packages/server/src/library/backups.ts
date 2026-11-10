import { createHash } from 'node:crypto';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { BackupInfo } from '@vtt/shared';
import { z } from 'zod';
import { readFolder, writeFolder } from '../store/folder-files.ts';
import { readJson, writeJson } from '../store/json-files.ts';

export type { BackupInfo };

// Copies of a game folder kept in the data folder's backups/<game>/<id>/:
// made when a game loads and every so often while it is played (each only
// if something changed since the last one), by hand from the lobby, and
// before a restore. Pictures (assets/) are left out: they are big and
// play doesn't change them.

export type BackupReason = BackupInfo['reason'];

const MetaSchema = z.object({
  at: z.number(),
  reason: z.enum(['load', 'timer', 'manual', 'restore', 'reimport']),
  hash: z.string(),
});

const SKIP = ['assets'];
const META = 'backup.json';
const KEEP = 20;

/** Thrown for a backup that isn't there. */
export class BackupError extends Error {}

export class Backups {
  constructor(
    private dataDir: string,
    private keep = KEEP,
  ) {}

  dirOf(game: string, id: string): string {
    return join(this.dataDir, 'backups', game, id);
  }

  /** Newest first. */
  async list(game: string): Promise<BackupInfo[]> {
    return (await this.metas(game)).map(({ id, at, reason }) => ({ id, at, reason }));
  }

  /** Copies the game folder; undefined when nothing changed since the last copy (a manual one is made anyway). */
  async snapshot(game: string, dir: string, reason: BackupReason): Promise<BackupInfo | undefined> {
    const files = await readFolder(dir, SKIP);
    const hash = hashOf(files);
    const [newest] = await this.metas(game);
    if (newest?.hash === hash && reason !== 'manual') return undefined;
    const at = Math.max(Date.now(), (newest?.at ?? 0) + 1);
    const id = new Date(at).toISOString().replaceAll(/[:.]/g, '-');
    await writeFolder(this.dirOf(game, id), files);
    await writeJson(join(this.dirOf(game, id), META), { at, reason, hash });
    await this.prune(game);
    return { id, at, reason };
  }

  /** Puts backup `id` back over the game folder: everything but its pictures is replaced. */
  async restore(game: string, id: string, dir: string): Promise<void> {
    const meta = (await this.metas(game)).find((m) => m.id === id);
    if (!meta) throw new BackupError('No such backup.');
    const files = (await readFolder(this.dirOf(game, id))).filter((f) => f.path !== META);
    for (const name of await readdir(dir)) {
      if (!SKIP.includes(name)) await rm(join(dir, name), { recursive: true, force: true });
    }
    await writeFolder(dir, files);
  }

  private async metas(game: string): Promise<(BackupInfo & { hash: string })[]> {
    const root = join(this.dataDir, 'backups', game);
    const ids = await readdir(root).catch(() => [] as string[]);
    const all = await Promise.all(
      ids.map(async (id) => {
        const meta = MetaSchema.safeParse(await readJson(join(root, id, META)));
        return meta.success ? { id, ...meta.data } : undefined;
      }),
    );
    return all.filter((m) => m !== undefined).sort((a, b) => b.at - a.at);
  }

  private async prune(game: string): Promise<void> {
    for (const old of (await this.metas(game)).slice(this.keep)) {
      await rm(this.dirOf(game, old.id), { recursive: true, force: true });
    }
  }
}

function hashOf(files: readonly { path: string; data: Buffer }[]): string {
  const h = createHash('sha256');
  for (const f of files) h.update(f.path).update('\0').update(f.data).update('\0');
  return h.digest('hex');
}
