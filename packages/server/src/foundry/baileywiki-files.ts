import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { type BaileywikiClient, isBaileywikiMedia } from './baileywiki-client.ts';

// Baileywiki's media, fetched when first asked, as their Content Module
// does in Foundry: the `baileywiki` pack names files it hasn't got
// (baileywiki-online.ts), and the first request for one downloads it with
// the server's Baileywiki sign-in into the pack, which serves it from then
// on. Baileywiki decides what the membership may have; a file it refuses
// is not asked for again for a while.

const PACK = 'baileywiki';
/** How long a sign-in is used before it is checked again, and a refusal remembered. */
const FRESH = 10 * 60_000;

export interface BaileywikiSource {
  client(): Promise<BaileywikiClient>;
}

const exists = (path: string) =>
  stat(path).then(
    (s) => s.isFile(),
    () => false,
  );

export class BaileywikiFiles {
  private signedIn?: { at: number; client: Promise<BaileywikiClient> };
  private pending = new Map<string, Promise<string | undefined>>();
  private refused = new Map<string, number>();

  constructor(
    private account: BaileywikiSource,
    private packsDir: string,
    private now: () => number = Date.now,
  ) {}

  /** The file in the pack at `path` (media/<Baileywiki path>), downloaded first if need be; undefined if it can't be had. */
  fetch(pack: string, path: string): Promise<string | undefined> {
    const file = /^media\/(.+)$/.exec(path)?.[1];
    if (pack !== PACK || !file || !isBaileywikiMedia(file)) return Promise.resolve(undefined);
    if (this.now() - (this.refused.get(file) ?? -Infinity) < FRESH) return Promise.resolve(undefined);
    let job = this.pending.get(file);
    if (!job) {
      job = this.download(file).finally(() => this.pending.delete(file));
      this.pending.set(file, job);
    }
    return job;
  }

  private client(): Promise<BaileywikiClient> {
    if (!this.signedIn || this.now() - this.signedIn.at >= FRESH) {
      const client = this.account.client();
      this.signedIn = { at: this.now(), client };
      client.catch(() => (this.signedIn = undefined));
    }
    return this.signedIn.client;
  }

  private async download(file: string): Promise<string | undefined> {
    const to = join(this.packsDir, PACK, 'media', file);
    if (await exists(to)) return to;
    try {
      const bytes = await (await this.client()).bytes(file);
      await mkdir(dirname(to), { recursive: true });
      await writeFile(`${to}.part`, bytes);
      await rename(`${to}.part`, to);
      return to;
    } catch {
      this.refused.set(file, this.now());
      return undefined;
    }
  }
}
