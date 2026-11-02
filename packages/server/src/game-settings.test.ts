import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { contentFor } from './library/game-packs.ts';
import { GameStore } from './store/game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// The GM's options for the whole game: the rules edition and the system's
// settings (D&D: the encumbrance rule), kept in game.json.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  game = new Game(store, { rng: () => 0 });
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

const hero = { stats: { class: 'fighter', level: 1 } };

describe('game settings', () => {
  it('are set by the GM, reach everyone and change the rules the game plays', () => {
    const gm = seat('gm');
    const ana = seat('ana');
    gm.receive({ t: 'gameSettings', rules: '2024', settings: { encumbrance: 'variant' } });
    expect(gm.take('error')).toEqual([]);
    expect(store.campaign).toMatchObject({ rules: '2024', settings: { encumbrance: 'variant' } });
    expect(contentFor(store, hero).settings?.encumbrance).toBe('variant');
    expect(contentFor(store, hero).edition).toBe('2024');
    const welcome = ana.take('welcome').at(-1);
    expect(welcome?.world.settings).toEqual({ encumbrance: 'variant' });
  });

  it('are the GM’s alone, and checked by the game’s system', () => {
    const gm = seat('gm');
    const ana = seat('ana');
    ana.receive({ t: 'gameSettings', settings: { encumbrance: 'off' } });
    expect(ana.take('error')).toHaveLength(1);
    gm.receive({ t: 'gameSettings', settings: { encumbrance: 'heavy' } });
    gm.receive({ t: 'gameSettings', rules: '1999', settings: {} });
    expect(gm.take('error')).toHaveLength(2);
    expect(store.campaign.settings).toBeUndefined();
  });
});
