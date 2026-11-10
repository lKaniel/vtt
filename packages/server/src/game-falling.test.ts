import { TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';

let store: GameStore;
let game: Game;
let dice: number[];

const flying = { id: 'fly', name: 'Fly', speeds: { fly: 60 } };

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  store.setToken(
    TokenSchema.parse({ ...store.tokens.get('goblin'), x: 550, y: 150, monster: 'goblin', hp: 7, elevation: 30 }),
  );
});

afterEach(async () => {
  await store.flush();
});

function gm(): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer('gm')!);
  ws.take('welcome');
  return ws;
}

const goblin = () => store.tokens.get('goblin')!;
const conditions = () => (goblin().effects ?? []).flatMap((e) => e.conditions ?? []);

describe('Falling', () => {
  it('a flyer that loses its flight falls: 1d6 per 10 feet, landing prone', () => {
    const ws = gm();
    store.setToken({ ...goblin(), effects: [flying] });
    ws.receive({ t: 'chat', text: 'hold on' });
    expect(goblin().elevation).toBe(30);
    // The GM ends the flight; three d6 come up 1 each.
    dice = [0, 0, 0];
    ws.receive({ t: 'removeEffect', token: 'goblin', effect: 'fly' });
    expect(ws.take('error')).toEqual([]);
    expect(goblin().elevation).toBeUndefined();
    expect(goblin().hp).toBe(7 - 3);
    expect(conditions()).toContain('prone');
  });

  it('a flyer knocked prone falls too', () => {
    const ws = gm();
    store.setToken({ ...goblin(), effects: [flying] });
    ws.receive({ t: 'chat', text: 'up here' });
    store.setToken({ ...goblin(), effects: [flying, { id: 'prone', name: 'Prone', conditions: ['prone'] }] });
    dice = [0, 0, 0];
    ws.receive({ t: 'chat', text: 'oof' });
    expect(goblin().elevation).toBeUndefined();
  });

  it('a creature set high by hand that never flew stays where it is put', () => {
    const ws = gm();
    ws.receive({ t: 'chat', text: 'on the balcony' });
    expect(goblin().elevation).toBe(30);
  });

  it('a creature that hovers stays up', () => {
    const ws = gm();
    store.setToken({ ...goblin(), effects: [{ ...flying, speeds: { fly: 60, hover: true } }] });
    ws.receive({ t: 'chat', text: 'still here' });
    expect(goblin().elevation).toBe(30);
  });
});
