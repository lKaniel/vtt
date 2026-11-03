import { dirname } from 'node:path';
import { z } from 'zod';
import { BaileywikiAccount } from '../foundry/baileywiki-account.ts';
import { BAILEYWIKI_URL } from '../foundry/baileywiki-client.ts';
import { baileywikiScenes, COMPENDIA, importBaileywiki } from '../foundry/baileywiki-import.ts';
import type { GameHub } from '../library/game-hub.ts';
import { HttpError, parseBody, send, type Call, type Routes } from './http-json.ts';
import type { SessionStore } from './sessions.ts';

// /api/baileywiki: the admin signs the server in to Baileywiki with the
// code from content.baileywiki.com (GET status, POST sign-in, DELETE signs
// out), lists the scenes of Baileywiki's online compendia (GET scenes) and
// imports picked ones into the private "baileywiki" pack (POST import),
// which games then turn on like any pack.

export interface BaileywikiDeps {
  sessions: SessionStore;
  hub: GameHub;
  baileywiki?: string;
}

const SignInInput = z.object({ code: z.string().min(1).max(4000) });
const ImportInput = z.object({
  scenes: z
    .array(z.object({ compendium: z.enum(COMPENDIA), id: z.string().regex(/^\w{1,64}$/) }))
    .min(1)
    .max(200),
});

export class BaileywikiRoutes implements Routes {
  private account: BaileywikiAccount;

  constructor(private deps: BaileywikiDeps) {
    this.account = new BaileywikiAccount(dirname(deps.hub.packs.dir), deps.baileywiki ?? BAILEYWIKI_URL);
  }

  handles(route: string | undefined): boolean {
    return route === 'baileywiki';
  }

  async serve(call: Call): Promise<void> {
    if (!this.deps.sessions.isAdmin(call.token))
      throw new HttpError(403, 'Only the server admin can do that: give the admin password.');
    send(call.res, 200, await this.answer(call));
  }

  private async answer(call: Call): Promise<unknown> {
    switch (`${call.method} ${call.parts[1] ?? ''}`) {
      case 'GET ':
        return this.account.status();
      case 'POST sign-in':
        return this.account.signIn((await parseBody(call.req, SignInInput)).code);
      case 'DELETE ':
        return this.account.signOut();
      case 'GET scenes':
        return { scenes: await baileywikiScenes(await this.account.client(), this.packsDir) };
      case 'POST import':
        return this.import(call);
      default:
        throw new HttpError(405, 'Method not allowed.');
    }
  }

  private get packsDir(): string {
    return this.deps.hub.packs.dir;
  }

  private async import(call: Call): Promise<unknown> {
    const { scenes } = await parseBody(call.req, ImportInput);
    const report = await importBaileywiki(await this.account.client(), this.packsDir, scenes);
    await this.deps.hub.packs.load();
    return report;
  }
}
