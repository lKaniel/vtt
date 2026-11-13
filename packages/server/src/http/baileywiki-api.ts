import { dirname } from 'node:path';
import { isGm } from '@vtt/shared';
import { z } from 'zod';
import { BaileywikiAccount } from '../foundry/baileywiki-account.ts';
import { BAILEYWIKI_URL } from '../foundry/baileywiki-client.ts';
import { installBaileywikiLibrary } from '../foundry/baileywiki-online.ts';
import { baileywikiScenes, COMPENDIA, importBaileywiki } from '../foundry/baileywiki-import.ts';
import type { GameHub } from '../library/game-hub.ts';
import { HttpError, parseBody, send, type Call, type Routes } from './http-json.ts';
import type { SessionStore } from './sessions.ts';

// /api/baileywiki: the admin signs the server in to Baileywiki with the
// code from content.baileywiki.com (GET status, POST sign-in, DELETE signs
// out), lists the scenes of Baileywiki's online compendia (GET scenes) and
// imports picked ones into the private "baileywiki" pack (POST import),
// or downloads Baileywiki's whole prefab library (POST library),
// which games then turn on like any pack. A game's GM may do the same from
// the game's Assets tab (`?game=<id>`), and adds the scenes it hands back.

export interface BaileywikiDeps {
  sessions: SessionStore;
  hub: GameHub;
  baileywiki?: string;
  /** The Content Module's manifest; foundrymods.com's unless a test serves its own. */
  baileywikiModule?: string;
  /** The server's sign-in, shared with the files fetched on first view (baileywiki-files.ts). */
  baileywikiAccount?: BaileywikiAccount;
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
    this.account =
      deps.baileywikiAccount ?? new BaileywikiAccount(dirname(deps.hub.packs.dir), deps.baileywiki ?? BAILEYWIKI_URL);
  }

  handles(route: string | undefined): boolean {
    return route === 'baileywiki';
  }

  async serve(call: Call): Promise<void> {
    if (!(await this.allowed(call))) throw new HttpError(403, "Only the server admin or a game's GM can do that.");
    send(call.res, 200, await this.answer(call));
  }

  /** The admin, or the GM of the game named in `?game=` (the game's Assets tab). */
  private async allowed(call: Call): Promise<boolean> {
    if (this.deps.sessions.isAdmin(call.token)) return true;
    const game = new URL(call.req.url ?? '/', 'http://localhost').searchParams.get('game');
    if (!game || !this.deps.hub.has(game)) return false;
    const seat = this.deps.sessions.seatIn(call.token, game);
    const player = (await this.deps.hub.info(game)).players.find((p) => p.id === seat);
    return !!player && isGm(player);
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
      case 'POST library':
        return this.library();
      default:
        throw new HttpError(405, 'Method not allowed.');
    }
  }

  private get packsDir(): string {
    return this.deps.hub.packs.dir;
  }

  /** Downloads Baileywiki's Content Module: its prefabs and scene browsers, their files fetched on first view. */
  private async library(): Promise<unknown> {
    await this.account.client();
    const { prefabs, scenes, skipped } = await installBaileywikiLibrary(this.packsDir, {
      manifest: this.deps.baileywikiModule,
    });
    await this.deps.hub.packs.load();
    return { prefabs, scenes, skipped: skipped.slice(0, 50) };
  }

  private async import(call: Call): Promise<unknown> {
    const { scenes } = await parseBody(call.req, ImportInput);
    const report = await importBaileywiki(await this.account.client(), this.packsDir, scenes);
    await this.deps.hub.packs.load();
    return report;
  }
}
