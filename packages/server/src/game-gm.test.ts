import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TokenSchema } from '@vtt/system-dnd5e';
import { Game } from './game.ts';
import { FakeSocket, makeWorld, savedToken } from './test/fixtures.ts';
import { GameStore } from './game-store.ts';

let dir: string;
let store: GameStore;
let game: Game;

beforeEach(async () => {
  dir = await makeWorld();
  store = new GameStore(dir);
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
    expect(await savedToken(dir, 'goblin')).toMatchObject({ name: 'Snik', monster: 'goblin' });
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
    // A plain player can't edit their own token either; trusted players can (game-permissions.test.ts).
    expect(ana.take('error').map((e) => e.message)).toEqual([
      "You can't edit Hero",
      ...Array<string>(3).fill('Only the GM can do that'),
    ]);
    expect(store.tokens.size).toBe(2);
  });

  it('deletes a token', async () => {
    const gm = seat('gm');
    gm.receive({ t: 'deleteToken', token: 'goblin' });
    expect(store.tokens.has('goblin')).toBe(false);
    await store.flush();
    expect(await savedToken(dir, 'goblin')).toBeUndefined();
  });
});

describe('spawning', () => {
  it('puts a monster on the map with a free id and a numbered name', async () => {
    const gm = seat('gm');
    gm.receive({ t: 'spawn', from: { kind: 'monster', id: 'goblin', rules: '2014' }, at: [720, 480], hidden: true });
    const spawned = store.tokens.get('goblin-2');
    expect(spawned).toMatchObject({ name: 'Goblin 2', monster: 'goblin', x: 750, y: 450, hidden: true });
    await store.flush();
    expect(await savedToken(dir, 'goblin-2')).toMatchObject({ monster: 'goblin' });
  });

  it('keeps a stock actor per monster in the Monsters folder, and places unlinked copies of it', async () => {
    const gm = seat('gm');
    const goblin = { t: 'spawn', from: { kind: 'monster', id: 'goblin', rules: '2014' } } as const;
    gm.receive({ ...goblin, at: [720, 480] });
    gm.receive({ ...goblin, at: [820, 480] });
    // The map's own "goblin" actor isn't the stock one (migrated from a hand-made token).
    const stock = [...store.actors.values()].filter((a) => a.monster === 'goblin');
    expect(stock).toMatchObject([{ id: 'goblin-2', name: 'Goblin', folder: 'Monsters' }]);
    expect(store.tokens.get('goblin-3')).toMatchObject({ actor: 'goblin-2', linked: false, name: 'Goblin 3' });
    await store.flush();
    const entries = (await readJson('scenes/main/tokens.json')) as { id: string }[];
    expect(entries.find((e) => e.id === 'goblin-3')).toEqual({
      id: 'goblin-3',
      x: 850,
      y: 450,
      actor: 'goblin-2',
      linked: false,
      delta: { name: 'Goblin 3' },
    });
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
    expect(store.tokens.get('bandit-2')).toMatchObject({ name: 'Bandit 2', x: 1050, actor: 'bandit', linked: false });
  });

  it('places a character’s actor as linked tokens that keep its name', () => {
    const gm = seat('gm');
    gm.receive({ t: 'spawn', from: { kind: 'actor', id: 'hero' }, at: [950, 950] });
    expect(store.tokens.get('hero-2')).toMatchObject({ name: 'Hero', actor: 'hero', linked: true });
    expect(store.actors.get('hero')!.name).toBe('Hero');
  });
});

describe('linking tokens to actors', () => {
  it('unlinks, saves, resets and links a token for the GM', () => {
    const gm = seat('gm');
    gm.receive({ t: 'relinkToken', token: 'hero', how: 'unlink' });
    gm.receive({ t: 'editToken', token: 'hero', patch: { hp: 2 } });
    expect(store.actors.get('hero')!.hp).toBeUndefined();
    gm.receive({ t: 'relinkToken', token: 'hero', how: 'reset' });
    expect(store.tokens.get('hero')!.hp).toBeUndefined();
    gm.receive({ t: 'relinkToken', token: 'hero', how: 'link' });
    expect(store.tokens.get('hero')!.linked).toBe(true);
    expect(gm.take('error')).toEqual([]);
  });

  it('refuses what makes no sense, and players', () => {
    const gm = seat('gm');
    const ana = seat('ana');
    store.setToken(TokenSchema.parse({ id: 'rock', name: 'Rock', x: 0, y: 0 }));
    gm.receive({ t: 'relinkToken', token: 'rock', how: 'link' });
    gm.receive({ t: 'relinkToken', token: 'hero', how: 'save' });
    gm.receive({ t: 'relinkToken', token: 'nope', how: 'link' });
    ana.receive({ t: 'relinkToken', token: 'hero', how: 'unlink' });
    expect(gm.take('error').map((e) => e.message)).toEqual([
      'Rock has no actor',
      'Hero is linked: its changes are already its actor’s',
      'No such token',
    ]);
    expect(ana.take('error').map((e) => e.message)).toEqual(['Only the GM can do that']);
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
      darkvision: 0,
      hidden: false,
    });
    const gm = new FakeSocket();
    game.connect(gm.asWebSocket, game.findPlayer('gm')!);
    const [welcome] = gm.take('welcome');
    expect(welcome!.actors!.map((a) => a.id)).toEqual(['goblin', 'hero', 'bandit']);
    expect(welcome!.players!.map((p) => p.id)).toEqual(['gm', 'ana', 'bo']);
    const ana = new FakeSocket();
    game.connect(ana.asWebSocket, game.findPlayer('ana')!);
    const [anaWelcome] = ana.take('welcome');
    expect(anaWelcome!.actors).toBeUndefined();
    expect(anaWelcome!.players).toBeUndefined();
  });
});

describe('arranging the hotbar', () => {
  it('saves the layout for a creature you control', () => {
    const ana = seat('ana');
    ana.receive({ t: 'hotbar', token: 'hero', slots: ['spell:fire-bolt', null] });
    expect(store.tokens.get('hero')!.hotbar).toEqual(['spell:fire-bolt', null]);
    const bo = seat('bo');
    bo.receive({ t: 'hotbar', token: 'hero', slots: [] });
    expect(bo.take('error')[0]!.message).toMatch(/don't control/);
  });
});
