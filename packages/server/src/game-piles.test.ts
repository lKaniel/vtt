import { type Token, TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// Item piles on the table: Ana's hero stands in the room (150, 150) with a
// chest of loot beside them and a merchant's stall a square to the south.

let store: GameStore;
let game: Game;

const tok = (id: string): Token | undefined => store.tokens.get(id);
const put = (data: object) => store.setToken(TokenSchema.parse(data));
const errors = (ws: FakeSocket) => ws.take('error').map((m) => m.message);
const said = (ws: FakeSocket) => ws.take('chat').map((m) => m.message.text);

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  game = new Game(store, { rng: () => 0.5 });
  put({
    ...tok('hero'),
    darkvision: 60,
    inventory: [{ item: 'dagger', qty: 2 }, { item: 'bag-of-holding' }],
    currency: { gp: 20 },
  });
  put({
    id: 'chest',
    name: 'Chest',
    x: 250,
    y: 150,
    pile: {},
    inventory: [{ item: 'rope' }, { item: 'torch', qty: 5 }],
    currency: { gp: 3, sp: 4 },
  });
  put({
    id: 'stall',
    name: 'Stall',
    x: 150,
    y: 250,
    pile: { kind: 'merchant' },
    inventory: [{ item: 'longsword', qty: 2 }],
  });
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

describe('loot piles', () => {
  it('give their gear and coins to a creature beside them, as one step the GM undoes', () => {
    const ana = seat('ana');
    ana.receive({ t: 'trade', from: 'chest', to: 'hero', item: 1, qty: 2 });
    ana.receive({ t: 'trade', from: 'chest', to: 'hero', coins: { gp: 3 } });
    expect(said(ana)).toEqual(['Hero takes 2 × Torch from Chest', 'Hero takes 3 gp from Chest']);
    expect(tok('hero')).toMatchObject({ currency: { gp: 23 } });
    expect(tok('hero')?.inventory?.at(-1)).toMatchObject({ item: 'torch', qty: 2 });
    expect(tok('chest')).toMatchObject({ currency: { sp: 4 }, inventory: [{ item: 'rope' }, { qty: 3 }] });
    seat('gm').receive({ t: 'undo' });
    expect(tok('chest')?.currency).toEqual({ gp: 3, sp: 4 });
  });

  it('go once they are empty, unless they are kept', () => {
    const ana = seat('ana');
    ana.receive({ t: 'trade', from: 'chest', to: 'hero', item: 0 });
    ana.receive({ t: 'trade', from: 'chest', to: 'hero', item: 0 });
    ana.receive({ t: 'trade', from: 'chest', to: 'hero', coins: { gp: 3, sp: 4 } });
    expect(tok('chest')).toBeUndefined();
    put({ id: 'box', name: 'Box', x: 250, y: 150, pile: { keepEmpty: true }, currency: { cp: 1 } });
    ana.receive({ t: 'trade', from: 'box', to: 'hero', coins: { cp: 1 } });
    expect(tok('box')).toBeDefined();
  });

  it('take what a creature puts in them', () => {
    const ana = seat('ana');
    ana.receive({ t: 'trade', from: 'hero', to: 'chest', item: 0, qty: 1 });
    expect(tok('chest')?.inventory?.at(-1)).toMatchObject({ item: 'dagger', qty: 1 });
    expect(tok('hero')?.inventory?.[0]).toMatchObject({ item: 'dagger', qty: 1 });
  });

  it('refuse creatures that are not yours, too far away, or a locked pile', () => {
    const bo = seat('bo');
    bo.receive({ t: 'trade', from: 'chest', to: 'hero', item: 0 });
    const ana = seat('ana');
    put({ ...tok('hero'), x: 50, y: 50 });
    put({ ...tok('chest'), x: 250, y: 250, pile: { reach: 5 } });
    ana.receive({ t: 'trade', from: 'chest', to: 'hero', item: 0 });
    put({ ...tok('chest'), x: 250, y: 150, pile: { locked: true } });
    ana.receive({ t: 'trade', from: 'chest', to: 'hero', item: 0 });
    expect([...errors(bo), ...errors(ana)]).toEqual([
      "You don't control Hero",
      'Hero is too far from Chest',
      'Chest is locked',
    ]);
  });
});

describe('merchants', () => {
  it('sell at their price and buy at half of it', () => {
    const ana = seat('ana');
    ana.receive({ t: 'trade', from: 'stall', to: 'hero', item: 0 });
    expect(tok('hero')?.currency).toEqual({ gp: 5 });
    expect(tok('stall')?.inventory).toMatchObject([{ item: 'longsword', qty: 1 }]);
    ana.receive({ t: 'trade', from: 'hero', to: 'stall', item: 0, qty: 2 });
    expect(said(ana)).toEqual(['Hero buys Longsword from Stall for 15 gp', 'Hero sells 2 × Dagger to Stall for 2 gp']);
    expect(tok('hero')?.currency).toEqual({ gp: 7 });
  });

  it('refuse what has no price, what you cannot pay for, and coins', () => {
    const ana = seat('ana');
    ana.receive({ t: 'trade', from: 'hero', to: 'stall', item: 1 });
    put({ ...tok('hero'), currency: { gp: 1 } });
    ana.receive({ t: 'trade', from: 'stall', to: 'hero', item: 0 });
    ana.receive({ t: 'trade', from: 'hero', to: 'stall', coins: { gp: 1 } });
    expect(errors(ana)).toEqual([
      "Stall won't buy Bag of Holding",
      "Hero can't pay 15 gp for Longsword",
      'Stall trades in goods, not coins',
    ]);
  });

  it('never run out when their stock is endless', () => {
    put({ ...tok('stall'), pile: { kind: 'merchant', infinite: true } });
    seat('ana').receive({ t: 'trade', from: 'stall', to: 'hero', item: 0 });
    expect(tok('stall')?.inventory?.[0]?.qty).toBe(2);
  });
});

describe('dropping gear', () => {
  it('makes a pile where the creature stands, or adds to one beside it', () => {
    const ana = seat('ana');
    ana.receive({ t: 'trade', from: 'hero', item: 0, qty: 1 });
    const pile = [...store.tokens.values()].find((t) => t.pile && t.id !== 'chest' && t.id !== 'stall');
    expect(pile).toMatchObject({ x: 150, y: 150, pile: { kind: 'loot' }, inventory: [{ item: 'dagger', qty: 1 }] });
    expect(said(ana)).toEqual(['Hero drops Dagger']);
    ana.receive({ t: 'trade', from: 'hero', coins: { gp: 2 } });
    expect(tok(pile!.id)?.currency).toEqual({ gp: 2 });
  });
});
