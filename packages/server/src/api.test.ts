import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameStore } from './game-store.ts';
import { startApi, type ApiServer } from './test/api-server.ts';

let api: ApiServer;
let store: GameStore;
let worldDir: string;

beforeEach(async () => {
  api = await startApi();
  worldDir = api.home;
  ({ store } = await api.hub.open('test'));
});

afterEach(async () => {
  await api.close();
});

type Json = Record<string, unknown>;
const client = () => api.client();

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

describe('account api', () => {
  it('signs up, signs in and out', async () => {
    const call = client();
    expect((await call('GET', '/api/session')).json).toMatchObject({
      account: null,
      home: { id: 'test', name: 'Test', rules: '2014' },
    });
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
    const joined = await call('POST', '/api/games/test/join', { character: id });
    expect(joined).toMatchObject({ status: 200, json: { player: { id: 'dee', role: 'player' } } });
    expect(store.world.players.map((p) => p.id)).toContain('dee');
    const token = store.tokens.get(id)!;
    expect(token).toMatchObject({
      name: 'Vex',
      ownership: { default: 'limited', dee: 'owner' },
      stats: { class: 'sorcerer', level: 1 },
    });
    expect(token).toMatchObject({ actor: id, linked: true });
    expect(store.actors.get(id)).toMatchObject({ name: 'Vex', ownership: { default: 'limited', dee: 'owner' } });
    await store.flush();
    const saved = JSON.parse(await readFile(join(worldDir, 'game.json'), 'utf8')) as { players: Json[] };
    expect(saved.players.map((p) => p.id)).toContain('dee');
  });

  it('levels the token up with its character, keeping its wounds and position', async () => {
    const call = client();
    await call('POST', '/api/register', { username: 'cy', password: 'hunter22', name: 'Cy' });
    const id = ((await call('POST', '/api/characters', sorcerer)).json.character as Json).id as string;
    await call('POST', '/api/games/test/join', { character: id });
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
    expect((await call('POST', '/api/games/test/join', {})).json).toMatchObject({ player: { id: 'boss', role: 'gm' } });
    expect((await client()('POST', '/api/games/test/join', {})).status).toBe(401);
  });
});
