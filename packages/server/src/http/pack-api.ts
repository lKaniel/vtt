import { PackUploads } from '../library/pack-uploads.ts';
import type { GameHub } from '../library/game-hub.ts';
import { HttpError, parseBody, send, type Call, type Routes } from './http-json.ts';
import type { SessionStore } from './sessions.ts';
import { z } from 'zod';

// Setup's packs (pack-uploads.ts), for the server's admin:
//   GET    packs                        installed packs and unfinished uploads
//   POST   packs/upload                 pack.json: starts or goes on with an upload
//   PUT    packs/<id>/files/<path...>   one file of it, as the body
//   POST   packs/<id>/finish            installs it
//   DELETE packs/<id>/upload            calls it off
//   DELETE packs/<id>                   deletes an installed pack

export interface PackDeps {
  sessions: SessionStore;
  hub: GameHub;
}

const Manifest = z.record(z.string(), z.unknown());

export class PackRoutes implements Routes {
  private uploads: PackUploads;

  constructor(private deps: PackDeps) {
    this.uploads = new PackUploads(deps.hub.packs);
  }

  handles(route: string | undefined): boolean {
    return route === 'packs';
  }

  async serve(call: Call): Promise<void> {
    if (!this.deps.sessions.isAdmin(call.token)) throw new HttpError(403, 'Give the admin password first.');
    send(call.res, 200, await this.answer(call));
  }

  private async answer(call: Call): Promise<unknown> {
    const [, id = '', sub = '', ...rest] = call.parts.map(decodeURIComponent);
    switch (`${call.method} ${id && id !== 'upload' ? '<id>' : id}/${sub}`) {
      case 'GET /':
        return this.list();
      case 'POST upload/':
        return this.uploads.begin(await parseBody(call.req, Manifest));
      case 'PUT <id>/files':
        await this.uploads.putFile(id, rest.join('/'), call.req);
        return {};
      case 'POST <id>/finish':
        return { pack: await this.uploads.finish(id) };
      case 'DELETE <id>/upload':
        await this.uploads.cancel(id);
        return {};
      case 'DELETE <id>/':
        await this.uploads.remove(id);
        return {};
      default:
        throw new HttpError(405, 'Method not allowed.');
    }
  }

  private async list(): Promise<unknown> {
    const { packs } = this.deps.hub;
    await packs.load();
    return { packs: packs.list(), pending: await this.uploads.pending() };
  }
}
