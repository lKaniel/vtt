import { TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// Who sees a roll: public, GM (the GM and the roller), blind (the GM; the
// roller only that they rolled) and self (the roller).

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

const chats = (ws: FakeSocket) => ws.take('chat').map((m) => m.message);

describe('roll modes', () => {
  it('roll in public by default', () => {
    const [a, bo, gm] = [seat('ana'), seat('bo'), seat('gm')];
    a.receive({ t: 'chat', text: '/r 1d20' });
    for (const ws of [a, bo, gm]) {
      const [m] = chats(ws);
      expect(m).toMatchObject({ by: 'ana' });
      expect(m?.roll).toBeDefined();
    }
  });

  it('show a GM roll to the GM and the roller', () => {
    const [a, bo, gm] = [seat('ana'), seat('bo'), seat('gm')];
    a.receive({ t: 'rollMode', mode: 'gm' });
    a.receive({ t: 'chat', text: '/r 1d20' });
    expect(chats(a)).toEqual([expect.objectContaining({ mode: 'gm' })]);
    expect(chats(gm)).toHaveLength(1);
    expect(chats(bo)).toEqual([]);
  });

  it('hide a blind roll from the roller and show it to the GM', () => {
    const [a, bo, gm] = [seat('ana'), seat('bo'), seat('gm')];
    a.receive({ t: 'rollMode', mode: 'blind' });
    a.receive({ t: 'chat', text: '/r 1d20' });
    const [mine] = chats(a);
    expect(mine).toMatchObject({ by: 'ana', mode: 'blind', hidden: true });
    expect(mine?.roll).toBeUndefined();
    expect(chats(gm)[0]?.roll?.total).toBeGreaterThan(0);
    expect(chats(bo)).toEqual([]);
  });

  it('show a self roll to the roller only', () => {
    const [a, gm] = [seat('ana'), seat('gm')];
    a.receive({ t: 'chat', text: '/sr 1d20' });
    expect(chats(a)).toEqual([expect.objectContaining({ mode: 'self' })]);
    expect(chats(gm)).toEqual([]);
  });

  it('leave plain chat public whatever the mode', () => {
    const [a, bo] = [seat('ana'), seat('bo')];
    a.receive({ t: 'rollMode', mode: 'self' });
    a.receive({ t: 'chat', text: 'hello' });
    expect(chats(bo)).toEqual([expect.objectContaining({ text: 'hello' })]);
  });

  it('let the roller see their own GM roll again after joining anew', () => {
    const a = seat('ana');
    a.receive({ t: 'chat', text: '/gmr 1d20' });
    const again = new FakeSocket();
    game.connect(again.asWebSocket, game.findPlayer('ana')!);
    expect(again.take('welcome')[0]?.chat).toHaveLength(1);
    const bo = new FakeSocket();
    game.connect(bo.asWebSocket, game.findPlayer('bo')!);
    expect(bo.take('welcome')[0]?.chat).toEqual([]);
  });

  it('apply to the cards of the roller’s game actions', () => {
    for (const id of ['hero', 'goblin'])
      store.setToken(TokenSchema.parse({ ...store.tokens.get(id), monster: 'goblin' }));
    const [a, gm] = [seat('ana'), seat('gm')];
    gm.receive({ t: 'rollMode', mode: 'blind' });
    gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
    const [card] = chats(gm);
    expect(card).toMatchObject({ mode: 'blind' });
    expect(card?.text).toMatch(/initiative/);
    expect(chats(a)).toEqual([]);
  });
});
