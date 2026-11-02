import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// The GM showing an image to the players, and each seat's own colour and avatar.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
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

describe('showing an image', () => {
  it('opens it on every player’s screen', () => {
    const [gm, ana, bo] = [seat('gm'), seat('ana'), seat('bo')];
    gm.receive({ t: 'showImage', src: '/assets/map.png', title: 'Old map' });
    const shown = { t: 'showImage', src: '/assets/map.png', title: 'Old map' };
    expect(ana.take('showImage')).toEqual([shown]);
    expect(bo.take('showImage')).toEqual([shown]);
    expect(gm.take('showImage')).toEqual([]);
  });

  it('is the GM’s to do', () => {
    const [ana, bo] = [seat('ana'), seat('bo')];
    ana.receive({ t: 'showImage', src: '/assets/map.png' });
    expect(ana.take('error')[0]?.message).toMatch(/only the GM/i);
    expect(bo.take('showImage')).toEqual([]);
  });
});

describe('your colour and avatar', () => {
  it('are kept on your seat and sent back in a fresh welcome', () => {
    const ana = seat('ana');
    ana.receive({ t: 'profile', color: '#3366ff', avatar: '/assets/ana.png' });
    const you = ana.take('welcome').at(-1)?.you;
    expect(you).toMatchObject({ color: '#3366ff', avatar: '/assets/ana.png' });
    expect(store.world.players.find((p) => p.id === 'ana')).toMatchObject({ avatar: '/assets/ana.png' });
  });

  it('sign your chat', () => {
    const ana = seat('ana');
    ana.receive({ t: 'profile', color: '#3366ff', avatar: '/assets/ana.png' });
    ana.receive({ t: 'chat', text: 'hello' });
    expect(ana.take('chat').at(-1)?.message).toMatchObject({ color: '#3366ff', avatar: '/assets/ana.png' });
  });

  it('takes the avatar away again, and refuses a colour that isn’t one', () => {
    const ana = seat('ana');
    ana.receive({ t: 'profile', avatar: '/assets/ana.png' });
    ana.receive({ t: 'profile', avatar: null });
    expect(store.world.players.find((p) => p.id === 'ana')?.avatar).toBeUndefined();
    ana.receive({ t: 'profile', color: 'red; background: url(x)' });
    expect(ana.take('error')).toHaveLength(1);
  });
});
