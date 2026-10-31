import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { WorldStore } from './world-store.ts';

let dir: string;
let store: WorldStore;
let game: Game;

beforeEach(async () => {
  dir = await makeWorld();
  store = new WorldStore(dir);
  await store.load();
  game = new Game(store);
});

afterEach(async () => {
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  ws.take('welcome');
  return ws;
}

const readJson = async (rel: string): Promise<unknown> => JSON.parse(await readFile(join(dir, rel), 'utf8'));

describe('the GM editing tokens', () => {
  it('changes any field and saves it; null puts a field back to its default', async () => {
    const gm = seat('gm');
    gm.receive({ t: 'editToken', token: 'goblin', patch: { name: 'Snik', monster: 'goblin', hp: 3 } });
    expect(store.tokens.get('goblin')).toMatchObject({ name: 'Snik', hp: 3 });
    gm.receive({ t: 'editToken', token: 'goblin', patch: { hp: null } });
    expect(store.tokens.get('goblin')!.hp).toBeUndefined();
    await store.flush();
    expect(await readJson('tokens/goblin.json')).toMatchObject({ name: 'Snik', monster: 'goblin' });
  });

  it('refuses edits that would break the token file', () => {
    const gm = seat('gm');
    gm.receive({ t: 'editToken', token: 'goblin', patch: { speed: -5 } });
    expect(gm.take('error')[0]!.message).toMatch(/speed/);
    expect(store.tokens.get('goblin')!.speed).toBe(30);
  });

  it('is for the GM only', () => {
    const ana = seat('ana');
    ana.receive({ t: 'editToken', token: 'hero', patch: { hp: 99 } });
    ana.receive({ t: 'deleteToken', token: 'hero' });
    ana.receive({ t: 'spawn', from: { kind: 'monster', id: 'goblin', rules: '2014' }, at: [0, 0] });
    ana.receive({ t: 'saveActor', actor: { id: 'x', name: 'X' } });
    expect(ana.take('error').map((e) => e.message)).toEqual(Array(4).fill('Only the GM can do that'));
    expect(store.tokens.size).toBe(2);
  });

  it('deletes a token', async () => {
    const gm = seat('gm');
    gm.receive({ t: 'deleteToken', token: 'goblin' });
    expect(store.tokens.has('goblin')).toBe(false);
    await store.flush();
    await expect(readJson('tokens/goblin.json')).rejects.toThrow();
  });
});

describe('spawning', () => {
  it('puts a monster on the map with a free id and a numbered name', async () => {
    const gm = seat('gm');
    gm.receive({ t: 'spawn', from: { kind: 'monster', id: 'goblin', rules: '2014' }, at: [720, 480], hidden: true });
    const spawned = store.tokens.get('goblin-2');
    expect(spawned).toMatchObject({ name: 'Goblin 2', monster: 'goblin', x: 750, y: 450, hidden: true });
    await store.flush();
    expect(await readJson('tokens/goblin-2.json')).toMatchObject({ monster: 'goblin' });
  });

  it('refuses a monster that is not in the book', () => {
    const gm = seat('gm');
    gm.receive({ t: 'spawn', from: { kind: 'monster', id: 'tarrasque-jr', rules: '2014' }, at: [0, 0] });
    expect(gm.take('error')[0]!.message).toMatch(/No monster "tarrasque-jr"/);
  });

  it('places copies of an actor', () => {
    const gm = seat('gm');
    gm.receive({ t: 'saveActor', actor: { id: 'bandit', name: 'Bandit', monster: 'bandit', folder: 'Road' } });
    gm.receive({ t: 'spawn', from: { kind: 'actor', id: 'bandit' }, at: [950, 950] });
    gm.receive({ t: 'spawn', from: { kind: 'actor', id: 'bandit' }, at: [1050, 950] });
    expect(store.tokens.get('bandit')).toMatchObject({ name: 'Bandit', monster: 'bandit', x: 950, y: 950 });
    expect(store.tokens.get('bandit-2')).toMatchObject({ name: 'Bandit 2', x: 1050 });
  });
});

describe('the Actors list', () => {
  it('saves actors to files and tells only the GM', async () => {
    const gm = seat('gm');
    const ana = seat('ana');
    gm.receive({ t: 'saveActor', actor: { id: 'bandit', name: 'Bandit', monster: 'bandit' } });
    expect(gm.take('actor')[0]!.actor).toMatchObject({ id: 'bandit' });
    expect(ana.take('actor')).toEqual([]);
    await store.flush();
    expect(await readJson('actors/bandit.json')).toMatchObject({ name: 'Bandit' });
    gm.receive({ t: 'deleteActor', actor: 'bandit' });
    expect(gm.take('actorGone')).toEqual([{ t: 'actorGone', id: 'bandit' }]);
    expect(store.actors.has('bandit')).toBe(false);
  });

  it('refuses a broken actor', () => {
    const gm = seat('gm');
    gm.receive({ t: 'saveActor', actor: { id: 'Bad Id', name: 'Bad' } });
    expect(gm.take('error')[0]!.message).toMatch(/id/);
  });

  it('sends the GM the actors and the players when they join', () => {
    store.setActor({
      id: 'bandit',
      name: 'Bandit',
      size: 1,
      color: '#b04a3a',
      speed: 30,
      controllers: [],
      darkvision: 0,
      hidden: false,
    });
    const gm = new FakeSocket();
    game.connect(gm.asWebSocket, game.findPlayer('gm')!);
    const [welcome] = gm.take('welcome');
    expect(welcome!.actors!.map((a) => a.id)).toEqual(['bandit']);
    expect(welcome!.players!.map((p) => p.id)).toEqual(['gm', 'ana', 'bo']);
    const ana = new FakeSocket();
    game.connect(ana.asWebSocket, game.findPlayer('ana')!);
    const [anaWelcome] = ana.take('welcome');
    expect(anaWelcome!.actors).toBeUndefined();
    expect(anaWelcome!.players).toBeUndefined();
  });
});
