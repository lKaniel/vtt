import type { OffsiteStatus } from '@vtt/shared';
import type { OffsiteBackups } from '../library/offsite-backups.ts';
import { OffsiteError } from '../library/offsite-backups.ts';
import { HttpError, send, type Call, type Routes } from './http-json.ts';
import type { SessionStore } from './sessions.ts';

// Setup's nightly backups off the server (offsite-backups.ts), for the
// server's admin: GET offsite (where they go, the nights there are),
// POST offsite (make tonight's now), POST offsite/<night>/<game>/restore.

export interface OffsiteDeps {
  sessions: SessionStore;
  /** Missing when the server has no backup storage set up. */
  offsite?: OffsiteBackups;
}

const NONE: OffsiteStatus = { target: null, hour: 3, running: false };

export class OffsiteRoutes implements Routes {
  constructor(private deps: OffsiteDeps) {}

  handles(route: string | undefined): boolean {
    return route === 'offsite';
  }

  async serve(call: Call): Promise<void> {
    if (!this.deps.sessions.isAdmin(call.token)) throw new HttpError(403, 'Give the admin password first.');
    const [, night, game, action] = call.parts;
    const route = `${call.method} ${action ?? (night ? '?' : '')}`;
    if (route === 'GET ') return this.list(call);
    if (route !== 'POST ' && route !== 'POST restore') throw new HttpError(405, 'Method not allowed.');
    const offsite = this.storage();
    if (route === 'POST ') send(call.res, 200, { night: await offsite.run() });
    else {
      await offsite.restore(night ?? '', game ?? '');
      send(call.res, 200, {});
    }
  }

  private async list(call: Call): Promise<void> {
    const { offsite } = this.deps;
    send(call.res, 200, { status: offsite?.status() ?? NONE, nights: (await offsite?.nights()) ?? [] });
  }

  private storage(): OffsiteBackups {
    if (!this.deps.offsite) throw new OffsiteError('This server has no backup storage set up: see docs/deploy.md.');
    return this.deps.offsite;
  }
}
