import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './store/game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// The GM's "ignore walls" mode: a creature stuck in a wall (or walled in)
// goes straight where the GM drops it. Players can't ask for it.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
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

describe('moving through walls', () => {
  it('takes the GM straight through the room wall', () => {
    const gm = seat('gm');
    gm.receive({ t: 'move', token: 'hero', to: [150, 450], throughWalls: true });
    expect(gm.take('moved')[0]!.path).toEqual([
      [150, 150],
      [150, 450],
    ]);
    expect(store.tokens.get('hero')).toMatchObject({ x: 150, y: 450 });
  });

  it('still walks a player round the walls', () => {
    const ana = seat('ana');
    ana.receive({ t: 'move', token: 'hero', to: [150, 450], throughWalls: true });
    expect(ana.take('moved')[0]?.path.length ?? 99).toBeGreaterThan(2);
  });
});
