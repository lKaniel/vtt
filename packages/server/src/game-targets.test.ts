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
const gmWho = { player: 'gm', name: 'GM', color: '#8a8a8a' };

describe('targets', () => {
  it('show what a player targets to everyone else on the scene, and are not an edit', () => {
    const [a, gm] = [seat('ana'), seat('gm')];
    a.receive({ t: 'target', tokens: ['hero'] });
    expect(gm.take('targets')).toEqual([{ t: 'targets', ...ana, tokens: ['hero'] }]);
    expect(a.take('targets')).toEqual([]);
    expect(a.take('history')).toEqual([]);
  });

  it('leave out the tokens someone can’t see', () => {
    const [a, gm] = [seat('ana'), seat('gm')];
    gm.receive({ t: 'target', tokens: ['goblin', 'hero'] });
    expect(a.take('targets')).toEqual([{ t: 'targets', ...gmWho, tokens: ['hero'] }]);
  });

  it('may only be tokens the player can see', () => {
    const [a, gm] = [seat('ana'), seat('gm')];
    a.receive({ t: 'target', tokens: ['goblin', 'hero', 'hero'] });
    expect(gm.take('targets')).toEqual([{ t: 'targets', ...ana, tokens: ['hero'] }]);
  });

  it('are shown to someone who joins later', () => {
    const a = seat('ana');
    a.receive({ t: 'target', tokens: ['hero'] });
    const ws = new FakeSocket();
    game.connect(ws.asWebSocket, game.findPlayer('gm')!);
    expect(ws.take('targets')).toEqual([{ t: 'targets', ...ana, tokens: ['hero'] }]);
  });

  it('go when their player leaves or is sent to another scene', () => {
    const [a, bo, gm] = [seat('ana'), seat('bo'), seat('gm')];
    a.receive({ t: 'target', tokens: ['hero'] });
    gm.take('targets');
    gm.receive({ t: 'sendPlayer', player: 'ana', scene: 'cellar' });
    expect(gm.take('targets')).toEqual([{ t: 'targets', ...ana, tokens: [] }]);
    gm.receive({ t: 'target', tokens: ['hero'] });
    bo.take('targets');
    gm.close();
    expect(bo.take('targets')).toEqual([{ t: 'targets', ...gmWho, tokens: [] }]);
  });
});
