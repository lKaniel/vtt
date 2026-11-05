import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './store/game-store.ts';
import { FakeSocket, makeTwoScenes } from './test/fixtures.ts';

// Walking up onto what stands in a 3D scene (a bridge, a tower's stairs):
// the 3D view knows the surfaces, so a walk there says how high it ends.
// The hero stands in the middle of the test room (150, 150).

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeTwoScenes());
  await store.load();
  game = new Game(store, { rng: () => 0.5 });
});

afterEach(async () => {
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  ws.sent = [];
  return ws;
}

const sceneView = (view: '2d' | '3d') =>
  store.applyOps([{ op: 'update', coll: 'scenes', id: 'main', patch: { view } }]);

describe('climbing in 3D', () => {
  it('ends a walk at the height of what the creature walked onto', () => {
    sceneView('3d');
    const ana = seat('ana');
    ana.receive({ t: 'move', token: 'hero', to: [250, 150], elevation: 10 });
    expect(store.tokens.get('hero')).toMatchObject({ x: 250, y: 150, elevation: 10 });
    // Those watching see it walk there, and end up that high.
    expect(ana.take('moved')).toMatchObject([{ id: 'hero', elevation: 10 }]);
  });

  it('keeps flat scenes flat: the height a walk names counts only in 3D', () => {
    sceneView('2d');
    seat('ana').receive({ t: 'move', token: 'hero', to: [250, 150], elevation: 10 });
    expect(store.tokens.get('hero')!.elevation ?? 0).toBe(0);
  });
});
