import { mkdtemp } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccountStore } from '../accounts.ts';
import { apiHandler } from '../api.ts';
import { CharacterStore } from '../characters.ts';
import { GameHub } from '../game-hub.ts';
import { makeWorld } from './fixtures.ts';

type Json = Record<string, unknown>;

export interface ApiServer {
  base: string;
  dataDir: string;
  home: string;
  hub: GameHub;
  accounts: AccountStore;
  /** A tiny browser: keeps the session cookie between calls. */
  client: () => (method: string, path: string, body?: unknown) => Promise<{ status: number; json: Json }>;
  close: () => Promise<void>;
}

/** The account and lobby API on a random port, over the test game as its home game. */
export async function startApi(): Promise<ApiServer> {
  const dataDir = await mkdtemp(join(tmpdir(), 'vtt-data-'));
  const home = await makeWorld();
  const hub = new GameHub({ dataDir, home, watch: false });
  await hub.load();
  const accounts = new AccountStore(dataDir);
  await accounts.load();
  const characters = new CharacterStore(dataDir);
  await characters.load();
  const api = apiHandler({ accounts, characters, hub });
  const server: Server = createServer((req, res) => {
    void api(req, res).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((done) => server.listen(0, done));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  const client = () => {
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
  const close = async () => {
    server.close();
    await hub.close();
  };
  return { base, dataDir, home, hub, accounts, client, close };
}
