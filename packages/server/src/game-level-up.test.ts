import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './store/game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// Levelling up in the game, from the sheet: an owner (or the GM) takes the
// next level for a character that is only an actor, the server rolls the
// hit die and says so in chat. Hero is Ana's, a linked token of its actor.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  game = new Game(store, { rng: () => 0.99 });
  const gm = seat('gm');
  gm.receive({
    t: 'editToken',
    token: 'hero',
    patch: {
      stats: { class: 'fighter', level: 3, abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } },
    },
  });
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

const errors = (ws: FakeSocket) => ws.take('error').map((e) => e.message);

describe('levelling up from the sheet', () => {
  it('gives the owner the next level, an improvement and a rolled hit die, and tells the table', () => {
    const gm = seat('gm');
    const ana = seat('ana');
    ana.receive({ t: 'levelUp', token: 'hero', class: 'fighter', hp: 'roll', improvement: { str: 2 } });
    expect(errors(ana)).toEqual([]);
    const stats = store.actors.get('hero')!.stats!;
    expect(stats.classes).toEqual([{ class: 'fighter', level: 4 }]);
    expect(stats.abilities?.str).toBe(18);
    // Fighter 3, Con 14: 10 + 2 + 2 × 8 = 28; the d10 rolls 10, plus Con.
    expect(stats.maxHp).toBe(40);
    expect(JSON.stringify(gm.take('chat'))).toMatch(/Hero reaches level 4 \(fighter 4\)/i);
  });

  it("refuses someone else's character and a level the rules don't allow", () => {
    const bo = seat('bo');
    const ana = seat('ana');
    bo.receive({ t: 'levelUp', token: 'hero', class: 'fighter', hp: 'average' });
    ana.receive({ t: 'levelUp', token: 'hero', class: 'fighter', hp: 'average', subclass: 'thief' });
    expect(errors(bo)).toEqual(['No such creature']);
    expect(errors(ana)).toEqual(['No subclass "thief" to pick at this level']);
  });

  it('levels an actor in the Actors list too', () => {
    const gm = seat('gm');
    gm.receive({ t: 'saveActor', actor: { id: 'mira', name: 'Mira', stats: { class: 'cleric', level: 1 } } });
    gm.receive({ t: 'levelUp', actor: 'mira', class: 'cleric', hp: 'average' });
    expect(errors(gm)).toEqual([]);
    expect(store.actors.get('mira')!.stats!.classes).toEqual([{ class: 'cleric', level: 2 }]);
  });
});
