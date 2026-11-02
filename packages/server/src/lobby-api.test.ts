import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startApi, type ApiServer } from './test/api-server.ts';

let api: ApiServer;

beforeEach(async () => {
  api = await startApi();
});

afterEach(async () => {
  await api.close();
});

type Json = Record<string, unknown>;

async function signUp(username: string) {
  const call = api.client();
  await call('POST', '/api/register', { username, password: 'hunter22', name: username.toUpperCase() });
  return call;
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

describe('the lobby', () => {
  it('lists the games an account may enter, with the systems a new one can use', async () => {
    const admin = await signUp('kaniel');
    const res = await admin('GET', '/api/games');
    expect(res.json.systems).toMatchObject([
      { id: 'dnd5e', name: 'Dungeons & Dragons 5e', editions: [{ id: '2014' }, { id: '2024' }] },
    ]);
    expect(res.json.games).toMatchObject([
      {
        id: 'test',
        name: 'Test',
        systemName: 'Dungeons & Dragons 5e',
        rules: '2014',
        you: null,
        members: 3,
        open: true,
        home: true,
      },
    ]);
    expect((await api.client()('GET', '/api/games')).status).toBe(401);
  });

  it('creates a game with its creator as GM, private until they invite someone', async () => {
    const kaniel = await signUp('kaniel');
    const ana = await signUp('ana');
    const made = await ana('POST', '/api/games', { name: 'Lost Mine', system: 'dnd5e', rules: '2024' });
    expect(made).toMatchObject({ status: 200, json: { game: { id: 'lost-mine', you: 'gm', rules: '2024' } } });
    const seen = await kaniel('GET', '/api/games');
    // The admin sees every game; a third account doesn't see Ana's.
    expect((seen.json.games as Json[]).map((g) => g.id)).toEqual(['test', 'lost-mine']);
    const bo = await signUp('bo');
    expect(((await bo('GET', '/api/games')).json.games as Json[]).map((g) => g.id)).toEqual(['test']);
    expect((await bo('GET', '/api/games/lost-mine')).status).toBe(404);
    expect((await bo('POST', '/api/games/lost-mine/join', {})).status).toBe(404);
  });

  it('explains what a new game is missing', async () => {
    const ana = await signUp('ana');
    const res = await ana('POST', '/api/games', { name: 'X', system: 'gurps', rules: '2014' });
    expect(res).toMatchObject({ status: 400, json: { error: 'Pick a system.' } });
  });

  it('lets a player in by the invite link, which only the GM sees and renews', async () => {
    const ana = await signUp('ana');
    const bo = await signUp('bo');
    await ana('POST', '/api/games', { name: 'Lost Mine', system: 'dnd5e', rules: '2014' });
    const { invite } = (await ana('POST', '/api/games/lost-mine/invite')).json as { invite: string };
    expect((await ana('GET', '/api/games/lost-mine')).json.game).toMatchObject({ invite });
    const joined = await bo('POST', `/api/invites/${invite}`);
    expect(joined).toMatchObject({ status: 200, json: { game: 'lost-mine' } });
    const detail = (await bo('GET', '/api/games/lost-mine')).json.game as Json;
    expect(detail.you).toBe('player');
    expect(detail.invite).toBeUndefined();
    expect((detail.players as Json[]).map((p) => [p.id, p.role])).toEqual([
      ['ana', 'gm'],
      ['bo', 'player'],
    ]);
    expect((await bo('POST', '/api/games/lost-mine/invite')).status).toBe(403);
    await ana('POST', '/api/games/lost-mine/invite');
    expect((await (await signUp('cy'))('POST', `/api/invites/${invite}`)).status).toBe(404);
  });

  it('brings a roster character into the game as an actor the player owns', async () => {
    const ana = await signUp('ana');
    await ana('POST', '/api/games', { name: 'Lost Mine', system: 'dnd5e', rules: '2014' });
    const id = ((await ana('POST', '/api/characters', sorcerer)).json.character as Json).id as string;
    const joined = await ana('POST', '/api/games/lost-mine/join', { character: id });
    expect(joined).toMatchObject({ status: 200, json: { player: { id: 'ana', role: 'gm' } } });
    const { store } = await api.hub.open('lost-mine');
    expect(store.tokens.get(id)).toMatchObject({ name: 'Vex', actor: id, linked: true });
    expect(store.actors.get(id)?.ownership).toMatchObject({ ana: 'owner' });
  });

  it('seats any account at an open game: the admin as GM of the home game', async () => {
    const kaniel = await signUp('kaniel');
    const ana = await signUp('ana');
    expect((await kaniel('POST', '/api/games/test/join', {})).json).toMatchObject({ player: { role: 'gm' } });
    expect((await ana('POST', '/api/games/test/join', {})).json).toMatchObject({ player: { role: 'player' } });
    await kaniel('PUT', '/api/games/test/open', { open: false });
    expect((await (await signUp('cy'))('POST', '/api/games/test/join', {})).status).toBe(404);
    expect((await ana('PUT', '/api/games/test/open', { open: true })).status).toBe(403);
  });

  it('lets the GM change roles and remove members, keeping a GM', async () => {
    const ana = await signUp('ana');
    const bo = await signUp('bo');
    await ana('POST', '/api/games', { name: 'Lost Mine', system: 'dnd5e', rules: '2014' });
    const { invite } = (await ana('POST', '/api/games/lost-mine/invite')).json as { invite: string };
    await bo('POST', `/api/invites/${invite}`);
    expect((await bo('PUT', '/api/games/lost-mine/members/bo', { role: 'gm' })).status).toBe(403);
    expect((await ana('PUT', '/api/games/lost-mine/members/bo', { role: 'trusted' })).status).toBe(200);
    expect((await ana('PUT', '/api/games/lost-mine/members/ana', { role: 'player' })).json.error).toMatch(/GM/);
    expect((await ana('DELETE', '/api/games/lost-mine/members/bo')).status).toBe(200);
    expect((await bo('GET', '/api/games/lost-mine')).status).toBe(404);
  });

  it('lets a member leave by themselves', async () => {
    const kaniel = await signUp('kaniel');
    const ana = await signUp('ana');
    await kaniel('POST', '/api/games/test/join', {});
    await ana('POST', '/api/games/test/join', {});
    expect((await ana('DELETE', '/api/games/test/members/ana')).status).toBe(200);
    expect((await ana('DELETE', '/api/games/test/members/gm')).status).toBe(403);
  });

  it('deletes a game for its GM or the admin, never for a player', async () => {
    const kaniel = await signUp('kaniel');
    const ana = await signUp('ana');
    await ana('POST', '/api/games', { name: 'One', system: 'dnd5e', rules: '2014' });
    await ana('POST', '/api/games', { name: 'Two', system: 'dnd5e', rules: '2014' });
    expect((await ana('DELETE', '/api/games/one')).status).toBe(200);
    expect((await kaniel('DELETE', '/api/games/two')).status).toBe(200);
    expect(api.hub.ids()).toEqual(['test']);
    expect((await kaniel('DELETE', '/api/games/test')).json.error).toMatch(/started with/);
  });
});

describe('importing a Foundry world', () => {
  async function foundryWorld(): Promise<string> {
    const dir = join(await mkdtemp(join(tmpdir(), 'foundry-')), 'worlds', 'lost-keep');
    await mkdir(join(dir, 'data'), { recursive: true });
    await writeFile(
      join(dir, 'world.json'),
      JSON.stringify({ id: 'lost-keep', title: 'The Lost Keep', system: 'dnd5e' }),
    );
    await writeFile(
      join(dir, 'data', 'scenes.db'),
      JSON.stringify({ _id: 's', name: 'Keep', width: 500, height: 500 }),
    );
    await writeFile(join(dir, 'data', 'actors.db'), JSON.stringify({ _id: 'a', name: 'Goblin', type: 'npc' }));
    return dir;
  }

  it('makes a new game from a world folder on the server, with the admin as its GM', async () => {
    const kaniel = await signUp('kaniel');
    const res = await kaniel('POST', '/api/games/import-foundry', { folder: await foundryWorld() });
    expect(res).toMatchObject({
      status: 200,
      json: { game: { id: 'the-lost-keep', name: 'The Lost Keep', you: 'gm' }, report: { scenes: 1, actors: 1 } },
    });
    expect((await kaniel('GET', '/api/games/the-lost-keep')).status).toBe(200);
    const again = await kaniel('POST', '/api/games/import-foundry', { folder: await foundryWorld(), name: 'Keep 2' });
    expect(again.json).toMatchObject({ game: { id: 'keep-2', name: 'Keep 2' } });
  });

  it("is the server admin's, since it reads the server's disk", async () => {
    await signUp('kaniel');
    const ana = await signUp('ana');
    const res = await ana('POST', '/api/games/import-foundry', { folder: await foundryWorld() });
    expect(res.status).toBe(403);
  });

  it('says what is wrong with a folder that is no world', async () => {
    const kaniel = await signUp('kaniel');
    const res = await kaniel('POST', '/api/games/import-foundry', { folder: tmpdir() });
    expect(res).toMatchObject({ status: 400, json: { error: expect.stringMatching(/world\.json/) as unknown } });
    expect(api.hub.ids()).toEqual(['test']);
  });
});
