import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './game-store.ts';

let dir: string;
let store: GameStore;
let game: Game;

beforeEach(async () => {
  dir = await makeWorld();
  // Ana is trusted for these tests; Cy only watches.
  const seats = JSON.parse(await readFile(join(dir, 'game.json'), 'utf8')) as { players: { role: string }[] };
  seats.players[1]!.role = 'trusted';
  seats.players.push({ id: 'cy', name: 'Cy', role: 'observer' } as never);
  await writeFile(join(dir, 'game.json'), JSON.stringify(seats));
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

describe('a trusted player editing their own token', () => {
  it('changes its fields like the GM does', () => {
    const ana = seat('ana');
    ana.receive({ t: 'editToken', token: 'hero', patch: { name: 'Ana the Bold', hp: 7 } });
    expect(ana.take('error')).toEqual([]);
    expect(store.tokens.get('hero')).toMatchObject({ name: 'Ana the Bold', hp: 7 });
  });

  it("can't touch tokens they don't own", () => {
    const ana = seat('ana');
    ana.receive({ t: 'editToken', token: 'goblin', patch: { hp: 1 } });
    expect(ana.take('error')[0]!.message).toBe("You can't edit Goblin");
    expect(store.tokens.get('goblin')!.hp).toBeUndefined();
  });

  it("can't give it away, move it by hand or hide it", () => {
    const ana = seat('ana');
    ana.receive({ t: 'editToken', token: 'hero', patch: { controllers: ['ana', 'bo'], x: 9999 } });
    expect(ana.take('error')[0]!.message).toBe('Only the GM can change controllers, x');
    expect(store.tokens.get('hero')).toMatchObject({ controllers: ['ana'], x: 150 });
  });

  it('still leaves deleting and spawning to the GM', () => {
    const ana = seat('ana');
    ana.receive({ t: 'deleteToken', token: 'hero' });
    expect(ana.take('error')[0]!.message).toBe('Only the GM can do that');
  });
});

describe('a plain player', () => {
  it("can't edit even their own token", () => {
    store.setToken({ ...store.tokens.get('hero')!, controllers: ['bo'] });
    const bo = seat('bo');
    bo.receive({ t: 'editToken', token: 'hero', patch: { hp: 99 } });
    expect(bo.take('error')[0]!.message).toBe("You can't edit Hero");
  });
});

describe('an observer seat', () => {
  it('sees the party sheet but cannot move it or open doors', () => {
    store.setToken({ ...store.tokens.get('hero')!, monster: 'goblin', controllers: ['ana', 'cy'] });
    const ws = new FakeSocket();
    game.connect(ws.asWebSocket, game.findPlayer('cy')!);
    const hero = ws.take('welcome')[0]!.tokens.find((t) => t.id === 'hero');
    expect(hero?.sheet).toBeDefined();
    ws.receive({ t: 'move', token: 'hero', to: [250, 250] });
    ws.receive({ t: 'door', chunk: '0_0', wall: 'door', state: 'open' });
    expect(ws.take('error').map((e) => e.message)).toEqual(["You don't control Hero", 'Observers only watch']);
  });
});

describe('the GM granting access', () => {
  it('changes a seat role live, without dropping anyone', async () => {
    const gm = seat('gm');
    const bo = seat('bo');
    gm.receive({ t: 'setRole', player: 'bo', role: 'trusted' });
    expect(gm.take('error')).toEqual([]);
    const welcome = bo.take('welcome');
    expect(welcome[0]!.you.role).toBe('trusted');
    expect(bo.readyState).toBe(1);
    await store.flush();
    const saved = JSON.parse(await readFile(join(dir, 'game.json'), 'utf8')) as {
      players: { id: string; role: string }[];
    };
    expect(saved.players.find((p) => p.id === 'bo')!.role).toBe('trusted');
  });

  it('keeps at least one GM', () => {
    const gm = seat('gm');
    gm.receive({ t: 'setRole', player: 'gm', role: 'player' });
    expect(gm.take('error')[0]!.message).toBe('The table needs a GM');
  });

  it('is for the GM only', () => {
    const ana = seat('ana');
    ana.receive({ t: 'setRole', player: 'ana', role: 'gm' });
    expect(ana.take('error')[0]!.message).toBe('Only the GM can do that');
  });

  it('sets per-token observers', () => {
    const gm = seat('gm');
    gm.receive({ t: 'editToken', token: 'goblin', patch: { observers: ['bo'] } });
    expect(store.tokens.get('goblin')!.observers).toEqual(['bo']);
  });
});
