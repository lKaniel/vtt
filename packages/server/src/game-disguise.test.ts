import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  // Bo stands beside the hero, to see what a stranger sees.
  const { actor: _a, linked: _l, ...hero } = store.tokens.get('hero')!;
  store.setToken({ ...hero, id: 'bo', name: 'Bo', x: 250, ownership: { default: 'limited', bo: 'owner' } });
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

const looks = [{ id: 'merchant', label: 'Merchant', name: 'Old Tobin', img: '/assets/uploads/tobin.webp' }];

describe('a player putting on a disguise', () => {
  it('shows the others only the disguise, and the owner and the GM both', () => {
    const [ana, bo, gm] = [seat('ana'), seat('bo'), seat('gm')];
    ana.receive({ t: 'editToken', token: 'hero', patch: { looks, look: 'merchant' } });
    expect(store.tokens.get('hero')).toMatchObject({ name: 'Hero', look: 'merchant' });
    const seen = bo.take('token').at(-1)!.token;
    expect(seen).toMatchObject({ name: 'Old Tobin', img: '/assets/uploads/tobin.webp' });
    expect(seen).not.toHaveProperty('looks');
    expect(gm.take('token').at(-1)!.token).toMatchObject({ name: 'Hero', look: 'merchant', looks });
    expect(ana.take('token').at(-1)!.token).toMatchObject({ name: 'Hero', look: 'merchant' });
  });

  it('takes it off again', () => {
    const [ana, bo] = [seat('ana'), seat('bo')];
    ana.receive({ t: 'editToken', token: 'hero', patch: { looks, look: 'merchant' } });
    ana.receive({ t: 'editToken', token: 'hero', patch: { look: null } });
    expect(bo.take('token').at(-1)!.token).toMatchObject({ name: 'Hero' });
  });

  it('is named by the disguise in chat', () => {
    const [ana, bo] = [seat('ana'), seat('bo')];
    ana.receive({ t: 'editToken', token: 'hero', patch: { looks, look: 'merchant' } });
    ana.receive({ t: 'chat', text: '/r 1d20', token: 'hero' });
    const said = bo.take('chat').map((m) => JSON.stringify(m.message));
    expect(said.join()).not.toContain('Hero');
  });
});
