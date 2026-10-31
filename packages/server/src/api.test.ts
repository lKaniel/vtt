import { mkdtemp, readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AccountStore } from './accounts.ts';
import { accountApi, upgradePlayer } from './api.ts';
import { CharacterStore } from './characters.ts';
import { makeWorld } from './test/fixtures.ts';
import { WorldStore } from './world-store.ts';

let server: Server;
let base: string;
let worldDir: string;
let store: WorldStore;
let accounts: AccountStore;

beforeEach(async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'vtt-data-'));
  worldDir = await makeWorld();
  store = new WorldStore(worldDir);
  await store.load();
  accounts = new AccountStore(dataDir);
  await accounts.load();
  const characters = new CharacterStore(dataDir);
  await characters.load();
  const api = accountApi({ accounts, characters, world: store });
  server = createServer((req, res) => {
    void api(req, res).then((handled) => {
      if (!handled) res.writeHead(404).end();
    });
  });
  await new Promise<void>((done) => server.listen(0, done));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  server.close();
  await store.flush();
});

type Json = Record<string, unknown>;

/** A tiny browser: keeps the session cookie between calls. */
function client() {
  let cookie = '';
  return async (method: string, path: string, body?: unknown): Promise<{ status: number; json: Json }> => {
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
}

const sorcerer = {
  name: 'Vex',
  rules: '2014',
  species: 'tiefling',
  class: 'sorcerer',
  subclass: 'draconic-bloodline',
  background: 'acolyte',
  base: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 15 },
  skills: ['arcana', 'deception'],
  spells: ['fire-bolt', 'light', 'mage-hand', 'prestidigitation', 'magic-missile', 'shield'],
};

describe('upgradePlayer', () => {
  it('takes the seat asked for, else the signed-in account', async () => {
    const account = await accounts.register({ username: 'cy', password: 'hunter22', name: 'Cy' });
    const token = await accounts.startSession(account.id);
    const find = (id: string) => (id ? { id, name: id, role: 'player' as const, color: '#fff' } : undefined);
    const req = (url: string, cookie = '') => ({ url, headers: { cookie } }) as never;
    expect(upgradePlayer(req('/ws?player=ana'), accounts, find)?.id).toBe('ana');
    expect(upgradePlayer(req('/ws', `other=1; vtt_session=${token}`), accounts, find)?.id).toBe('cy');
    expect(upgradePlayer(req('/ws'), accounts, find)).toBeUndefined();
  });
});

describe('account api', () => {
  it('signs up, signs in and out', async () => {
    const call = client();
    expect((await call('GET', '/api/session')).json).toMatchObject({ account: null, world: { name: 'Test' } });
    const reg = await call('POST', '/api/register', { username: 'kaniel', password: 'hunter22', name: 'Kaniel' });
    expect(reg).toMatchObject({ status: 200, json: { account: { id: 'kaniel', admin: true } } });
    expect((await call('GET', '/api/session')).json).toMatchObject({ account: { id: 'kaniel' } });
    await call('POST', '/api/logout');
    expect((await call('GET', '/api/session')).json).toMatchObject({ account: null });
    expect((await call('POST', '/api/login', { username: 'kaniel', password: 'nope' })).status).toBe(401);
    expect((await call('POST', '/api/login', { username: 'kaniel', password: 'hunter22' })).status).toBe(200);
  });

  it('explains why a sign-up failed', async () => {
    const call = client();
    const res = await call('POST', '/api/register', { username: 'k', password: 'hunter22', name: 'K' });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/^Usernames/);
  });

  it('keeps characters private to their owner', async () => {
    const ana = client();
    const bo = client();
    await ana('POST', '/api/register', { username: 'ana2', password: 'hunter22', name: 'Ana' });
    await bo('POST', '/api/register', { username: 'bo2', password: 'hunter22', name: 'Bo' });
    const made = await ana('POST', '/api/characters', sorcerer);
    expect(made.status).toBe(200);
    const id = (made.json.character as Json).id as string;
    expect(id).toMatch(/^vex-/);
    expect((await ana('GET', '/api/characters')).json.characters).toHaveLength(1);
    expect((await bo('GET', '/api/characters')).json.characters).toHaveLength(0);
    expect((await bo('PUT', `/api/characters/${id}`, sorcerer)).status).toBe(404);
    expect((await bo('DELETE', `/api/characters/${id}`)).status).toBe(404);
    expect((await ana('DELETE', `/api/characters/${id}`)).status).toBe(200);
    expect((await ana('GET', '/api/characters')).json.characters).toHaveLength(0);
  });

  it('refuses characters that break the rules, with the reasons', async () => {
    const call = client();
    await call('POST', '/api/register', { username: 'ana2', password: 'hunter22', name: 'Ana' });
    const res = await call('POST', '/api/characters', { ...sorcerer, skills: [] });
    expect(res).toMatchObject({ status: 400, json: { issues: ['Choose 2 class skills.'] } });
    expect((await client()('GET', '/api/characters')).status).toBe(401);
  });

  it('seats the account and puts its character on the map when joining', async () => {
    const call = client();
    await call('POST', '/api/register', { username: 'cy', password: 'hunter22', name: 'Cy' });
    await call('POST', '/api/register', { username: 'dee', password: 'hunter22', name: 'Dee' });
    const id = ((await call('POST', '/api/characters', sorcerer)).json.character as Json).id as string;
    const joined = await call('POST', '/api/join', { character: id });
    expect(joined).toMatchObject({ status: 200, json: { player: { id: 'dee', role: 'player' } } });
    expect(store.world.players.map((p) => p.id)).toContain('dee');
    const token = store.tokens.get(id)!;
    expect(token).toMatchObject({ name: 'Vex', controllers: ['dee'], stats: { class: 'sorcerer', level: 1 } });
    await store.flush();
    const saved = JSON.parse(await readFile(join(worldDir, 'world.json'), 'utf8')) as { players: Json[] };
    expect(saved.players.map((p) => p.id)).toContain('dee');
  });

  it('levels the token up with its character, keeping its wounds and position', async () => {
    const call = client();
    await call('POST', '/api/register', { username: 'cy', password: 'hunter22', name: 'Cy' });
    const id = ((await call('POST', '/api/characters', sorcerer)).json.character as Json).id as string;
    await call('POST', '/api/join', { character: id });
    store.setToken({ ...store.tokens.get(id)!, x: 950, y: 950, hp: 3 });
    const res = await call('PUT', `/api/characters/${id}`, {
      ...sorcerer,
      level: 2,
      hpRolls: [4],
      spells: [...sorcerer.spells, 'sleep'],
    });
    expect(res.status).toBe(200);
    expect(store.tokens.get(id)).toMatchObject({ x: 950, y: 950, hp: 3, stats: { level: 2 } });
  });

  it('joins without a character as a seat only, and the first account as GM', async () => {
    const call = client();
    await call('POST', '/api/register', { username: 'boss', password: 'hunter22', name: 'Boss' });
    expect((await call('POST', '/api/join', {})).json).toMatchObject({ player: { id: 'boss', role: 'gm' } });
    expect((await client()('POST', '/api/join', {})).status).toBe(401);
  });
});
