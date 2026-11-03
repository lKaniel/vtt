import { chmod } from 'node:fs/promises';
import { join } from 'node:path';
import type { BaileywikiStatus } from '@vtt/shared';
import { z } from 'zod';
import { BaileywikiClient, BaileywikiError, tierOf, type BaileywikiSignIn } from './baileywiki-client.ts';
import { readJson, removeJson, writeJson } from '../store/json-files.ts';

// The server's one Baileywiki sign-in, made by the admin: the code from
// content.baileywiki.com is checked there and kept in data/baileywiki.json
// (readable by the server's user only), never sent to a browser. Each use
// refreshes it, so a lapsed membership shows as soon as it lapses.

const SavedSchema = z.object({ token: z.string(), userId: z.string(), roles: z.array(z.string()) });

export class BaileywikiAccount {
  private saved?: BaileywikiSignIn;
  private loaded = false;

  constructor(
    private dataDir: string,
    readonly base: string,
  ) {}

  private get file(): string {
    return join(this.dataDir, 'baileywiki.json');
  }

  private async load(): Promise<BaileywikiSignIn | undefined> {
    if (!this.loaded) {
      const read = SavedSchema.safeParse(await readJson(this.file));
      this.saved = read.success ? read.data : undefined;
      this.loaded = true;
    }
    return this.saved;
  }

  private async save(signIn: BaileywikiSignIn | undefined): Promise<void> {
    this.saved = signIn;
    this.loaded = true;
    if (!signIn) return removeJson(this.file);
    await writeJson(this.file, signIn);
    await chmod(this.file, 0o600);
  }

  async status(): Promise<BaileywikiStatus> {
    const saved = await this.load();
    return { signedIn: !!saved, tier: saved ? tierOf(saved.roles) : 'none', signInUrl: `${this.base}/` };
  }

  /** Signs in with a code from Baileywiki's site; throws when Baileywiki turns it down. */
  async signIn(code: string): Promise<BaileywikiStatus> {
    const signIn = await new BaileywikiClient(this.base).refresh(code.trim());
    if (!signIn)
      throw new BaileywikiError("Baileywiki didn't accept that code: sign in on their site and copy it again.");
    await this.save(signIn);
    return this.status();
  }

  async signOut(): Promise<BaileywikiStatus> {
    await this.save(undefined);
    return this.status();
  }

  /** A client with a freshly checked sign-in; throws when there is none or it lapsed. */
  async client(): Promise<BaileywikiClient> {
    const saved = await this.load();
    if (!saved) throw new BaileywikiError('Sign in to Baileywiki first.');
    const client = new BaileywikiClient(this.base, saved.token);
    const fresh = await client.refresh();
    if (!fresh) {
      await this.save(undefined);
      throw new BaileywikiError('The Baileywiki sign-in ran out: sign in again.');
    }
    await this.save(fresh);
    return client;
  }
}
