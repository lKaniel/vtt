import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import type { CharacterStore } from '../library/characters.ts';
import { HubError, type GameHub } from '../library/game-hub.ts';
import {
  ensureSession,
  HttpError,
  parseBody,
  send,
  sessionCookie,
  sessionToken,
  type Call,
  type Routes,
} from './http-json.ts';
import { BaileywikiRoutes } from './baileywiki-api.ts';
import { LobbyRoutes } from './lobby-api.ts';
import { PackRoutes } from './pack-api.ts';
import { PackUploadError } from '../library/pack-uploads.ts';
import { BaileywikiError } from '../foundry/baileywiki-client.ts';
import type { BaileywikiAccount } from '../foundry/baileywiki-account.ts';
import { mcpHandler } from '../mcp/mcp-http.ts';
import { BackupError } from '../library/backups.ts';
import { OffsiteError, type OffsiteBackups } from '../library/offsite-backups.ts';
import { OffsiteRoutes } from './offsite-api.ts';
import { ArchiveError } from '../library/game-archive.ts';
import { SessionError, type SessionStore } from './sessions.ts';

// The server's HTTP side, as JSON: the browser's session and the admin
// password (here), and the games with their players and characters
// (lobby-api.ts). The game itself then runs over the WebSocket, signed in by
// the same cookie.

export interface ApiDeps {
  sessions: SessionStore;
  characters: CharacterStore;
  hub: GameHub;
  /** The server's own key for Claude (VTT_MCP_KEY): it sits as the home game's GM. */
  mcpKey?: string;
  /** Baileywiki's content server; content.baileywiki.com unless a test runs its own. */
  baileywiki?: string;
  /** The Content Module's manifest; foundrymods.com's unless a test serves its own. */
  baileywikiModule?: string;
  /** The server's Baileywiki sign-in, when the server shares it with the pack files (index.ts). */
  baileywikiAccount?: BaileywikiAccount;
  /** Nightly backups off the server, when it has backup storage. */
  offsite?: OffsiteBackups;
}

const AdminInput = z.object({ password: z.string().max(200) });
const AdminPasswordInput = z.object({ password: z.string().max(200).nullable() });

/** An error whose message is the answer: a 400. */
const isRefusal = (e: unknown): e is Error =>
  e instanceof SessionError ||
  e instanceof BaileywikiError ||
  e instanceof HubError ||
  e instanceof BackupError ||
  e instanceof OffsiteError ||
  e instanceof PackUploadError ||
  e instanceof ArchiveError;

/** Handles /api/ requests about the session and games; returns false for anything else. */
export function apiHandler(deps: ApiDeps): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const all: Routes[] = [
    new SessionRoutes(deps),
    new LobbyRoutes(deps),
    new BaileywikiRoutes(deps),
    new OffsiteRoutes(deps),
    new PackRoutes(deps),
  ];
  const mcp = mcpHandler(deps);
  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/mcp') return mcp(req, res);
    const parts = url.pathname.split('/').filter(Boolean).slice(1);
    const routes = all.find((r) => r.handles(parts[0]));
    if (!url.pathname.startsWith('/api/') || !routes) return false;
    const call: Call = { req, res, parts, method: req.method ?? 'GET', token: sessionToken(req) };
    try {
      await routes.serve(call);
    } catch (e) {
      if (isRefusal(e)) send(res, 400, { error: e.message });
      else if (e instanceof HttpError) send(res, e.status, { error: e.message, issues: e.issues });
      else throw e;
    }
    return true;
  };
}

class SessionRoutes implements Routes {
  constructor(private deps: ApiDeps) {}

  handles(route: string | undefined): boolean {
    return ['session', 'admin', 'logout'].includes(route ?? '');
  }

  async serve(call: Call): Promise<void> {
    switch (`${call.method} ${call.parts[0]}`) {
      case 'GET session':
        return this.session(call);
      case 'POST admin':
        return this.unlock(call);
      case 'PUT admin':
        return this.setPassword(call);
      case 'DELETE admin':
        return this.lock(call);
      case 'POST logout':
        return this.logout(call);
      default:
        throw new HttpError(405, 'Method not allowed.');
    }
  }

  /** Whether this browser may use Setup, and the server's home game (its name greets everyone). */
  private async session(call: Call): Promise<void> {
    const { sessions, hub } = this.deps;
    const id = hub.homeId;
    const home = id ? await hub.info(id) : undefined;
    send(call.res, 200, {
      admin: sessions.isAdmin(call.token),
      adminPassword: sessions.hasAdminPassword,
      adminFixed: sessions.adminFixed,
      home: home ? { id: home.id, name: home.name, rules: home.rules } : null,
    });
  }

  /** Opens Setup with the admin password. */
  private async unlock(call: Call): Promise<void> {
    const { password } = await parseBody(call.req, AdminInput);
    const token = await ensureSession(this.deps.sessions, call);
    if (!(await this.deps.sessions.unlockAdmin(token, password))) {
      throw new HttpError(403, 'That is not the admin password.');
    }
    send(call.res, 200, { admin: true });
  }

  /** Admin: a new admin password, or (null) none. */
  private async setPassword(call: Call): Promise<void> {
    if (!this.deps.sessions.isAdmin(call.token)) throw new HttpError(403, 'Give the admin password first.');
    const { password } = await parseBody(call.req, AdminPasswordInput);
    const token = await ensureSession(this.deps.sessions, call);
    await this.deps.sessions.setAdminPassword(token, password === '' ? null : password);
    send(call.res, 200, {});
  }

  /** Closes Setup on this browser again. */
  private async lock(call: Call): Promise<void> {
    if (call.token && this.deps.sessions.get(call.token)) await this.deps.sessions.lockAdmin(call.token);
    send(call.res, 200, {});
  }

  /** Forgets every game this browser joined, and admin. */
  private async logout(call: Call): Promise<void> {
    if (call.token) await this.deps.sessions.end(call.token);
    send(call.res, 200, {}, sessionCookie('', 0));
  }
}
