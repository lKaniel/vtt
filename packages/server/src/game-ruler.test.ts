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

const line = [
  [150, 150],
  [450, 150],
  [450, 450],
];

describe('the ruler', () => {
  it('shows a player measuring to everyone else on the scene, live', () => {
    const [ana, bo, gm] = [seat('ana'), seat('bo'), seat('gm')];
    ana.receive({ t: 'ruler', points: line });
    const shown = { t: 'ruler', player: 'ana', name: 'Ana', color: '#8a8a8a', points: line };
    expect(bo.take('ruler')).toEqual([shown]);
    expect(gm.take('ruler')).toEqual([shown]);
    expect(ana.take('ruler')).toEqual([]);
  });

  it('is not an edit: nothing to undo', () => {
    const ana = seat('ana');
    ana.receive({ t: 'ruler', points: line });
    expect(ana.take('history')).toEqual([]);
  });

  it('puts the ruler away for everyone when it is cleared or its player leaves', () => {
    const [ana, bo] = [seat('ana'), seat('bo')];
    ana.receive({ t: 'ruler', points: line });
    ana.receive({ t: 'ruler', points: [] });
    expect(bo.take('ruler').at(-1)?.points).toEqual([]);
    ana.receive({ t: 'ruler', points: line });
    bo.take('ruler');
    ana.close();
    expect(bo.take('ruler')).toEqual([expect.objectContaining({ player: 'ana', points: [] })]);
  });

  it('stays on its scene: those elsewhere never see it, and it goes when its player is sent away', () => {
    const [ana, bo, gm] = [seat('ana'), seat('bo'), seat('gm')];
    gm.receive({ t: 'sendPlayer', player: 'bo', scene: 'cellar' });
    bo.take('ruler');
    ana.receive({ t: 'ruler', points: line });
    expect(bo.take('ruler')).toEqual([]);
    gm.take('ruler');
    gm.receive({ t: 'sendPlayer', player: 'ana', scene: 'cellar' });
    expect(gm.take('ruler')).toEqual([expect.objectContaining({ player: 'ana', points: [] })]);
  });

  it('refuses rulers with too many waypoints', () => {
    const ana = seat('ana');
    ana.receive({ t: 'ruler', points: Array.from({ length: 200 }, (_, i) => [i, i]) });
    expect(ana.take('error')).toHaveLength(1);
  });
});
