// The roll pick (advantage or disadvantage for your next roll) reaches the
// rolls the server makes for you: initiative, death saves, opportunity
// attacks and legendary actions.
import { type Token, TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';

let store: GameStore;
let game: Game;
let dice: number[];
const face = (n: number, sides = 20) => (n - 1) / sides + 0.001;
const tok = (id: string): Token => store.tokens.get(id)!;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  store.setToken(
    TokenSchema.parse({
      id: 'bo',
      name: 'Fighter',
      x: 150,
      y: 150,
      ownership: { default: 'limited', bo: 'owner' },
      darkvision: 60,
      stats: { class: 'fighter', level: 5, maxHp: 40, abilities: { str: 16, dex: 10 } },
      inventory: [{ item: 'longsword', equipped: true }],
    }),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), x: 250, y: 150, monster: 'goblin' }));
});

afterEach(async () => {
  await store.flush();
});

function join_(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  ws.take('welcome');
  return ws;
}

describe('a roll pick the server rolls with', () => {
  it('rolls initiative with the advantage picked, then the pick is spent', () => {
    const bo = join_('bo');
    const gm = join_('gm');
    bo.receive({ t: 'rollPick', token: 'bo', edge: 'advantage' });
    // Bo's two d20s (2 and 15), then the goblin's.
    dice = [face(2), face(15), face(10)];
    gm.receive({ t: 'combatStart', tokens: ['bo', 'goblin'] });
    expect(store.combat!.order).toContainEqual({ token: 'bo', initiative: 15 });
    expect(bo.take('pickSpent')).toHaveLength(1);
  });

  it("is only spent by the picker's own creature", () => {
    const bo = join_('bo');
    const gm = join_('gm');
    bo.receive({ t: 'rollPick', token: 'goblin', edge: 'advantage' });
    expect(bo.take('error')[0]?.message).toMatch(/control/);
    dice = [face(2), face(15)];
    gm.receive({ t: 'combatStart', tokens: ['bo', 'goblin'] });
    expect(store.combat!.order).toContainEqual({ token: 'bo', initiative: 2 });
  });

  it('rolls a death save with the advantage picked', () => {
    store.setToken({ ...tok('bo'), hp: 0 });
    const bo = join_('bo');
    const gm = join_('gm');
    dice = [face(20), face(2)];
    gm.receive({ t: 'combatStart', tokens: ['goblin', 'bo'] });
    bo.receive({ t: 'rollPick', token: 'bo', edge: 'advantage' });
    dice = [face(4), face(12)];
    gm.receive({ t: 'endTurn' });
    expect(tok('bo').deathSaves).toMatchObject({ successes: 1, failures: 0 });
  });

  it('takes the pick back when it is picked away', () => {
    store.setToken({ ...tok('bo'), hp: 0 });
    const bo = join_('bo');
    const gm = join_('gm');
    dice = [face(20), face(2)];
    gm.receive({ t: 'combatStart', tokens: ['goblin', 'bo'] });
    bo.receive({ t: 'rollPick', token: 'bo', edge: 'advantage' });
    bo.receive({ t: 'rollPick', token: 'bo' });
    dice = [face(4), face(12)];
    gm.receive({ t: 'endTurn' });
    expect(tok('bo').deathSaves).toMatchObject({ successes: 0, failures: 1 });
  });

  it('rolls an opportunity attack with the pick sent with the answer', () => {
    store.setToken({ ...tok('bo'), x: 50, y: 250 });
    store.setToken({ ...tok('goblin'), x: 150, y: 250 });
    const bo = join_('bo');
    const gm = join_('gm');
    dice = [face(20), face(2)];
    gm.receive({ t: 'combatStart', tokens: ['goblin', 'bo'] });
    gm.receive({ t: 'move', token: 'goblin', to: [150, 50] });
    const [offer] = bo.take('reactionOffer');
    // A 20 would hit; disadvantage keeps the 1.
    dice = [face(20), face(1)];
    bo.receive({ t: 'react', offer: offer!.offer.id, choice: 'Longsword', edge: 'disadvantage' });
    expect(tok('goblin').hp).toBeUndefined();
    expect(store.combat!.reacted).toEqual(['bo']);
  });

  it('rolls a legendary attack with the pick sent', () => {
    store.setToken(
      TokenSchema.parse({ ...tok('goblin'), name: 'Dragon', monster: 'adult-black-dragon', x: 250, y: 250 }),
    );
    const gm = join_('gm');
    dice = [face(20), face(2)];
    gm.receive({ t: 'combatStart', tokens: ['bo', 'goblin'] });
    dice = [face(20), face(1)];
    gm.receive({ t: 'legendary', token: 'goblin', option: 'tail-attack', target: 'bo', edge: 'disadvantage' });
    expect(gm.take('error')).toEqual([]);
    expect(tok('bo').hp).toBeUndefined();
  });
});
