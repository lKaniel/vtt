import { mkdtemp } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiHandler } from '../http/api.ts';
import { CharacterStore } from '../library/characters.ts';
import { GameHub } from '../library/game-hub.ts';
import { FolderStore } from '../library/object-store.ts';
import { OffsiteBackups } from '../library/offsite-backups.ts';
import { SessionStore } from '../http/sessions.ts';
import { makeWorld } from './fixtures.ts';

type Json = Record<string, unknown>;
export type Client = (method: string, path: string, body?: unknown) => Promise<{ status: number; json: Json }>;

/** The admin password test servers have, unless a test asks for none (null). */
export const ADMIN_PASSWORD = 'open sesame';

export interface ApiServer {
  base: string;
  dataDir: string;
  home: string;
  hub: GameHub;
  sessions: SessionStore;
  /** A tiny browser: keeps the session cookie between calls. */
  client: () => Client;
  /** A browser that joined `game` as `player`. */
  joined: (game: string, player: string, password?: string) => Promise<Client>;
  /** A browser that gave the admin password. */
  admin: () => Promise<Client>;
  close: () => Promise<void>;
}

/** The session and lobby API on a random port, over the test game as its home game. */
export async function startApi(
  opts: { adminPassword?: string | null; mcpKey?: string; baileywiki?: string; offsite?: boolean } = {},
): Promise<ApiServer> {
  const dataDir = await mkdtemp(join(tmpdir(), 'vtt-data-'));
  const home = await makeWorld();
  const hub = new GameHub({ dataDir, home, watch: false });
  await hub.load();
  const sessions = new SessionStore(
    dataDir,
    opts.adminPassword === undefined ? ADMIN_PASSWORD : (opts.adminPassword ?? undefined),
  );
  await sessions.load();
  const characters = new CharacterStore(dataDir);
  await characters.load();
  const offsite = opts.offsite
    ? new OffsiteBackups({ store: new FolderStore(await mkdtemp(join(tmpdir(), 'vtt-offsite-'))), hub, dataDir })
    : undefined;
  const api = apiHandler({
    sessions,
    characters,
    hub,
    mcpKey: opts.mcpKey,
    baileywiki: opts.baileywiki,
    baileywikiModule: opts.baileywiki && `${opts.baileywiki}/module/manifest`,
    offsite,
  });
  const server: Server = createServer((req, res) => {
    void api(req, res).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((done) => server.listen(0, done));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  const client = (): Client => {
    let cookie = '';
    return async (method: string, path: string, body?: unknown) => {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { 'content-type': 'application/json', cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0]!;
      const text = await res.text();
      return { status: res.status, json: (text ? JSON.parse(text) : {}) as Json };
    };
  };
  const joined = async (game: string, player: string, password?: string) => {
    const call = client();
    const res = await call('POST', `/api/games/${game}/join`, { player, password });
    if (res.status !== 200) throw new Error(`could not join ${game} as ${player}: ${JSON.stringify(res.json)}`);
    return call;
  };
  const admin = async () => {
    const call = client();
    await call('POST', '/api/admin', { password: opts.adminPassword ?? ADMIN_PASSWORD });
    return call;
  };
  const close = async () => {
    server.close();
    await hub.close();
  };
  return { base, dataDir, home, hub, sessions, client, joined, admin, close };
}
