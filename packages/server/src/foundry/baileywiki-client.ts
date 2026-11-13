import { mediaKind } from '@vtt/core';
import { z } from 'zod';

// Talks to Baileywiki's content server (content.baileywiki.com) the way
// their own Foundry module (Baileywiki Content Module) does, with the
// sign-in code their site gives the user: auth-refresh checks the code and
// says which tiers it unlocks, file-details hands out a download address
// for a file the account may have, and that address is then fetched. The
// server decides every download; nothing here gets around it.

export const BAILEYWIKI_URL = 'https://content.baileywiki.com';

/** PocketBase role ids → tiers (from the Content Module's constants.mjs). */
const ROLE_TIERS: Record<string, string> = {
  ils0rk0o4b2mfux: 'standard',
  nrnn6s6djtxkuo6: 'advanced',
  '3o21j06edq1i81i': 'vip',
};
const TIER_RANK = ['none', 'free', 'standard', 'advanced', 'vip'];

/** The best tier a list of roles unlocks ("free" for a signed-in account without a paid one). */
export function tierOf(roles: readonly string[]): string {
  let best = 'free';
  for (const role of roles) {
    const tier = ROLE_TIERS[role];
    if (tier && TIER_RANK.indexOf(tier) > TIER_RANK.indexOf(best)) best = tier;
  }
  return best;
}

/** Baileywiki said no, or answered something we can't read. */
export class BaileywikiError extends Error {}

const RefreshSchema = z.object({
  token: z.string(),
  record: z.object({ id: z.string(), verified: z.boolean().optional(), roles: z.array(z.string()).default([]) }),
});

export interface BaileywikiSignIn {
  token: string;
  userId: string;
  roles: string[];
}

const DetailsSchema = z.object({ url: z.string().min(1) });

/** A path as Baileywiki keys its files: no leading slash, URI-decoded. */
export function baileywikiPath(src: string): string {
  const p = src.replace(/^\/+/, '');
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}

/** Files that come from Baileywiki (the rest, core icons or other modules', aren't theirs to give). */
const isBaileywikiFile = (path: string) => /^(bw-content-releases\/|modules\/baileywiki-)/.test(path);
const safe = (path: string) => !path.split('/').some((part) => part === '..' || part === '' || part === '.');

/** A picture, sound, video or model Baileywiki's server hands out (a Baileywiki path, see baileywikiPath). */
export const isBaileywikiMedia = (path: string) => !!mediaKind(path) && isBaileywikiFile(path) && safe(path);

export class BaileywikiClient {
  constructor(
    readonly base: string,
    private token = '',
  ) {}

  private post(path: string, body?: unknown): Promise<Response> {
    return fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: this.token },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  /** Checks a sign-in code; the fresh token and roles, or undefined when Baileywiki turns it down. */
  async refresh(code = this.token): Promise<BaileywikiSignIn | undefined> {
    this.token = code;
    const res = await this.post('/api/collections/users/auth-refresh');
    if (!res.ok) return undefined;
    const data = RefreshSchema.safeParse(await res.json());
    if (!data.success || data.data.record.verified === false) return undefined;
    this.token = data.data.token;
    return { token: data.data.token, userId: data.data.record.id, roles: data.data.record.roles };
  }

  /** Where to download a Baileywiki file from, if the account may have it. */
  async fileUrl(path: string): Promise<string> {
    const res = await this.post('/api/files/file-details', { file_path: baileywikiPath(path) });
    if (!res.ok) throw new BaileywikiError(`Baileywiki answered ${res.status} for ${baileywikiPath(path)}`);
    const details = DetailsSchema.safeParse(await res.json());
    if (!details.success) throw new BaileywikiError(`Baileywiki gave no download for ${baileywikiPath(path)}`);
    return details.data.url;
  }

  private async download(path: string): Promise<Response> {
    const res = await fetch(await this.fileUrl(path));
    if (!res.ok) throw new BaileywikiError(`downloading ${baileywikiPath(path)} failed: ${res.status}`);
    return res;
  }

  async json(path: string): Promise<unknown> {
    return (await this.download(path)).json();
  }

  async bytes(path: string): Promise<Buffer> {
    return Buffer.from(await (await this.download(path)).arrayBuffer());
  }
}
