import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './store/game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// Players place their own characters from the Actors tab, as in Foundry: a
// linked token of an actor they own, shown, one per scene. In the test world
// Hero is Ana's (an actor with a linked token), the goblin nobody's.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
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

const errors = (ws: FakeSocket) => ws.take('error').map((e) => e.message);
const place = (ws: FakeSocket, id: string, at: [number, number], hidden?: boolean) =>
  ws.receive({ t: 'spawn', from: { kind: 'actor', id }, at, ...(hidden !== undefined && { hidden }) });

describe('a player placing their own character', () => {
  it('puts a shown, linked token of an actor they own on the map', () => {
    const gm = seat('gm');
    gm.receive({ t: 'deleteToken', token: 'hero' });
    const ana = seat('ana');
    place(ana, 'hero', [950, 950], true);
    expect(errors(ana)).toEqual([]);
    const placed = [...store.tokens.values()].find((t) => t.actor === 'hero');
    expect(placed).toMatchObject({ name: 'Hero', linked: true, hidden: false, x: 950, y: 950 });
  });

  it('refuses a second token of the same character on one scene', () => {
    const ana = seat('ana');
    place(ana, 'hero', [950, 950]);
    expect(errors(ana)).toEqual(['Hero is already on this map']);
    expect([...store.tokens.values()].filter((t) => t.actor === 'hero')).toHaveLength(1);
  });

  it("refuses actors they don't own and monsters from the book", () => {
    const ana = seat('ana');
    const bo = seat('bo');
    place(ana, 'goblin', [950, 950]);
    place(bo, 'hero', [950, 950]);
    ana.receive({ t: 'spawn', from: { kind: 'monster', id: 'goblin', rules: '2014' }, at: [0, 0] });
    expect(errors(ana)).toEqual(["You can't place Goblin", 'Only the GM can do that']);
    expect(errors(bo)).toEqual(["You can't place Hero"]);
    expect(store.tokens.size).toBe(2);
  });
});

describe('the GM choosing what a player plays', () => {
  const plays = (ws: FakeSocket, player: string, actor: string, on = true) =>
    ws.receive({ t: 'setPlays', player, actor, plays: on });
  const seatOf = (id: string) => store.world.players.find((p) => p.id === id);

  it('gives a seat several creatures, the first one its character', () => {
    const gm = seat('gm');
    gm.receive({ t: 'saveActor', actor: { id: 'mira', name: 'Mira', stats: { level: 2, class: 'cleric' } } });
    plays(gm, 'bo', 'mira');
    plays(gm, 'bo', 'goblin');
    expect(errors(gm)).toEqual([]);
    expect(seatOf('bo')?.character).toBe('mira');
    expect(store.actors.get('mira')?.ownership).toMatchObject({ bo: 'owner' });
    expect(store.actors.get('goblin')?.ownership).toMatchObject({ bo: 'owner' });
    const bo = seat('bo');
    place(bo, 'mira', [950, 950]);
    expect(errors(bo)).toEqual([]);
  });

  it('takes a creature away for good: the player can no longer move it', () => {
    const gm = seat('gm');
    plays(gm, 'bo', 'hero');
    plays(gm, 'bo', 'hero', false);
    expect(errors(gm)).toEqual([]);
    expect(seatOf('bo')?.character).toBeUndefined();
    const bo = seat('bo');
    const hero = store.tokens.get('hero')!;
    bo.receive({ t: 'move', token: 'hero', to: [hero.x + 50, hero.y] });
    expect(store.tokens.get('hero')!.x).toBe(hero.x);
  });

  it('moves the character on to another of theirs when it is taken away', () => {
    const gm = seat('gm');
    gm.receive({ t: 'saveActor', actor: { id: 'mira', name: 'Mira', stats: { level: 2, class: 'cleric' } } });
    plays(gm, 'ana', 'hero');
    plays(gm, 'ana', 'mira');
    expect(seatOf('ana')?.character).toBe('hero');
    plays(gm, 'ana', 'hero', false);
    expect(store.actors.get('hero')?.ownership?.ana).toBeUndefined();
    expect(seatOf('ana')?.character).toBe('mira');
  });

  it('is for the GM only, and needs a real seat and actor', () => {
    const gm = seat('gm');
    const ana = seat('ana');
    plays(ana, 'ana', 'goblin');
    plays(gm, 'zed', 'hero');
    plays(gm, 'bo', 'nobody');
    expect(errors(ana)).toEqual(['Only the GM can do that']);
    expect(errors(gm)).toEqual(['No such player', 'No such actor']);
  });
});
