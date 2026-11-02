import { join } from 'node:path';
import { z } from 'zod';
import { readJson, writeJson } from './json-files.ts';

// What the server keeps about each game besides its folder: its players'
// passwords and Claude keys, and when it was last played. Kept in the data
// folder's games.json, so a game folder can be copied to another server
// without them. Fields of older servers (invites, open, approval) are dropped
// as the file is read.

const EntrySchema = z.object({
  lastPlayed: z.number().optional(),
  /** Players' passwords, hashed: player id → salted scrypt hash. */
  seatKeys: z.record(z.string(), z.object({ salt: z.string(), hash: z.string() })).optional(),
  /** Players' keys for Claude (mcp-http.ts): player id → SHA-256 of the key. */
  mcpKeys: z.record(z.string(), z.string()).optional(),
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

  /** Every game's entry. */
  all(): [string, IndexEntry][] {
    return [...this.entries];
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
