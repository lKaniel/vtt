import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeTwoScenes } from './test/fixtures.ts';
import { GameStore } from './game-store.ts';

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeTwoScenes());
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

const ana = { player: 'ana', name: 'Ana', color: '#8a8a8a' };

describe('pings', () => {
  it('show a spot to everyone else on the scene, and are not an edit', () => {
    const [a, bo, gm] = [seat('ana'), seat('bo'), seat('gm')];
    a.receive({ t: 'ping', at: [320, 240] });
    expect(bo.take('ping')).toEqual([{ t: 'ping', ...ana, at: [320, 240] }]);
    expect(gm.take('ping')).toHaveLength(1);
    expect(a.take('ping')).toEqual([]);
    expect(a.take('history')).toEqual([]);
  });

  it('stay on their scene', () => {
    const [a, bo, gm] = [seat('ana'), seat('bo'), seat('gm')];
    gm.receive({ t: 'sendPlayer', player: 'bo', scene: 'cellar' });
    a.receive({ t: 'ping', at: [1, 2] });
    expect(bo.take('ping')).toEqual([]);
  });

  it('pull everyone’s view to the spot when the GM asks', () => {
    const [bo, gm] = [seat('bo'), seat('gm')];
    gm.receive({ t: 'ping', at: [500, 500], pull: true });
    expect(bo.take('ping')).toEqual([expect.objectContaining({ player: 'gm', at: [500, 500], pull: true })]);
  });

  it('may not pull anyone’s view for a player', () => {
    const [a, bo] = [seat('ana'), seat('bo')];
    a.receive({ t: 'ping', at: [500, 500], pull: true });
    expect(bo.take('ping')).toEqual([]);
    expect(a.take('error')).toHaveLength(1);
  });
});

describe('cursors', () => {
  it('show where each player points to the others on the scene, live', () => {
    const [a, bo] = [seat('ana'), seat('bo')];
    a.receive({ t: 'cursor', at: [10, 20] });
    expect(bo.take('cursor')).toEqual([{ t: 'cursor', ...ana, at: [10, 20] }]);
    expect(a.take('cursor')).toEqual([]);
    expect(a.take('history')).toEqual([]);
  });

  it('go when the pointer leaves the map, its player leaves or is sent to another scene', () => {
    const [a, bo, gm] = [seat('ana'), seat('bo'), seat('gm')];
    a.receive({ t: 'cursor', at: [10, 20] });
    a.receive({ t: 'cursor', at: null });
    expect(bo.take('cursor').at(-1)).toEqual({ t: 'cursor', ...ana, at: null });
    a.receive({ t: 'cursor', at: [10, 20] });
    gm.take('cursor');
    gm.receive({ t: 'sendPlayer', player: 'ana', scene: 'cellar' });
    expect(gm.take('cursor')).toEqual([{ t: 'cursor', ...ana, at: null }]);
    bo.receive({ t: 'cursor', at: [5, 5] });
    gm.take('cursor');
    bo.close();
    expect(gm.take('cursor')).toEqual([expect.objectContaining({ player: 'bo', at: null })]);
  });
});
