import { join } from 'node:path';
import { z } from 'zod';
import { readJson, writeJson } from './json-files.ts';

// What the server keeps about each game besides its folder: the invite
// link, whether every account may join, and when it was last played. Kept
// in the data folder's games.json, so a game folder can be copied to
// another server without its invite.

const EntrySchema = z.object({
  /** Invite code: anyone with the link joins as a player. */
  invite: z.string().optional(),
  /** Every account on the server may join, no invite needed. */
  open: z.boolean().optional(),
  lastPlayed: z.number().optional(),
});
export type IndexEntry = z.infer<typeof EntrySchema>;

const FileSchema = z.object({ games: z.record(z.string(), EntrySchema).default({}) });

export class GameIndex {
  private entries = new Map<string, IndexEntry>();
  private saving = Promise.resolve();

  constructor(private dataDir: string) {}

  async load(): Promise<void> {
    const parsed = FileSchema.safeParse(await readJson(this.path));
    if (parsed.success) this.entries = new Map(Object.entries(parsed.data.games));
  }

  get(id: string): IndexEntry {
    return this.entries.get(id) ?? {};
  }

  set(id: string, change: Partial<IndexEntry>): Promise<void> {
    this.entries.set(id, { ...this.get(id), ...change });
    return this.save();
  }

  remove(id: string): Promise<void> {
    this.entries.delete(id);
    return this.save();
  }

  /** The game an invite code is for. */
  byInvite(code: string): string | undefined {
    for (const [id, e] of this.entries) if (code && e.invite === code) return id;
    return undefined;
  }

  /** Resolves once everything is on disk. */
  flush(): Promise<void> {
    return this.saving;
  }

  private get path(): string {
    return join(this.dataDir, 'games.json');
  }

  private save(): Promise<void> {
    const data = { games: Object.fromEntries(this.entries) };
    this.saving = this.saving.then(() => writeJson(this.path, data));
    return this.saving;
  }
}
