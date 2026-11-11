import { currentTurn, TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './store/game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// The GM running a fight by hand: whose turn it is, a step back, the round
// and the order, whatever the rules say.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  for (const id of ['hero', 'goblin'])
    store.setToken(TokenSchema.parse({ ...store.tokens.get(id), monster: 'goblin' }));
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

/** A fight with the hero (20) before the goblin (10), the hero's turn half spent. */
function fight(gm: FakeSocket): void {
  gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
  gm.receive({ t: 'initiative', token: 'hero', value: 20 });
  gm.receive({ t: 'initiative', token: 'goblin', value: 10 });
  const now = store.combat!;
  store.setCombat({ ...now, turn: 0, left: { ...now.left, action: false, move: 0 } });
}

describe('the GM giving the turn to a creature', () => {
  it('starts its turn afresh in the same round and says so', () => {
    const gm = seat('gm');
    fight(gm);
    gm.receive({ t: 'turnTo', token: 'goblin' });
    expect(currentTurn(store.combat!)).toBe('goblin');
    expect(store.combat!.round).toBe(1);
    expect(store.combat!.left).toMatchObject({ action: true, bonus: true });
    expect(gm.take('chat').at(-1)?.message.text).toMatch(/Goblin's turn/);
  });

  it('starts the current creature’s turn over', () => {
    const gm = seat('gm');
    fight(gm);
    gm.receive({ t: 'turnTo', token: 'hero' });
    expect(store.combat!.left.action).toBe(true);
    expect(store.combat!.left.move).toBeGreaterThan(0);
  });

  it('is the GM’s alone, and only for a creature in the fight', () => {
    const [gm, ana] = [seat('gm'), seat('ana')];
    fight(gm);
    ana.receive({ t: 'turnTo', token: 'goblin' });
    expect(ana.take('error')[0]!.message).toMatch(/GM/);
    expect(currentTurn(store.combat!)).toBe('hero');
    gm.receive({ t: 'combatant', token: 'goblin', on: false });
    gm.receive({ t: 'turnTo', token: 'goblin' });
    expect(gm.take('error')[0]!.message).toMatch(/not in the fight/);
  });
});

describe('the GM stepping back a turn', () => {
  it('goes to the creature before, and a round back past the top', () => {
    const gm = seat('gm');
    fight(gm);
    gm.receive({ t: 'endTurn' });
    gm.receive({ t: 'endTurn' });
    expect(store.combat).toMatchObject({ round: 2, turn: 0 });
    gm.receive({ t: 'turnBack' });
    expect(store.combat).toMatchObject({ round: 1, turn: 1 });
    gm.receive({ t: 'turnBack' });
    expect(store.combat).toMatchObject({ round: 1, turn: 0 });
  });

  it('is the GM’s alone', () => {
    const [gm, ana] = [seat('gm'), seat('ana')];
    fight(gm);
    ana.receive({ t: 'turnBack' });
    expect(ana.take('error')).toHaveLength(1);
  });
});

describe('the GM setting the round and the order', () => {
  it('sets the round and keeps the turn', () => {
    const gm = seat('gm');
    fight(gm);
    gm.receive({ t: 'round', value: 5 });
    expect(store.combat).toMatchObject({ round: 5, turn: 0 });
    expect(store.combat!.left.action).toBe(false);
  });

  it('moves a creature one place, the turn staying with whoever has it', () => {
    const gm = seat('gm');
    fight(gm);
    gm.receive({ t: 'orderMove', token: 'goblin', by: -1 });
    expect(store.combat!.order).toEqual([
      { token: 'goblin', initiative: 20 },
      { token: 'hero', initiative: 20 },
    ]);
    expect(currentTurn(store.combat!)).toBe('hero');
  });

  it('refuses players, and when no fight is on', () => {
    const [gm, ana] = [seat('gm'), seat('ana')];
    gm.receive({ t: 'round', value: 3 });
    expect(gm.take('error')[0]!.message).toMatch(/no fight/i);
    fight(gm);
    ana.receive({ t: 'round', value: 3 });
    ana.receive({ t: 'orderMove', token: 'hero', by: 1 });
    expect(ana.take('error')).toHaveLength(2);
  });
});

describe('the GM ending a turn for anybody', () => {
  it('ends a player’s turn for them', () => {
    const gm = seat('gm');
    fight(gm);
    gm.receive({ t: 'endTurn', token: 'hero' });
    expect(currentTurn(store.combat!)).toBe('goblin');
  });
});
