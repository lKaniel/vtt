// Reverse gravity and compulsion played through the game.
import { TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';

let store: GameStore;
let game: Game;
let dice: number[];
const face = (n: number, sides = 20) => (n - 1) / sides + 0.001;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      x: 50,
      y: 50,
      darkvision: 60,
      stats: { class: 'bard', level: 13, abilities: { cha: 18 }, spells: ['compulsion'] },
    }),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), x: 150, y: 50, monster: 'goblin' }));
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

const tok = (id: string) => store.tokens.get(id)!;

describe('reverse gravity', () => {
  it('lifts the goblin and drops it, hurt, when the caster stops concentrating', () => {
    store.setToken(
      TokenSchema.parse({
        ...tok('hero'),
        stats: { class: 'wizard', level: 13, abilities: { int: 18 }, spells: ['reverse-gravity'] },
      }),
    );
    const ana = join_('ana');
    dice = [face(1)];
    ana.receive({ t: 'cast', caster: 'hero', spell: 'reverse-gravity', slot: 7, targets: [], point: [150, 50] });
    expect(ana.take('error')).toEqual([]);
    expect(tok('goblin')).toMatchObject({ elevation: 100, aloft: 100 });
    ana.receive({ t: 'dropConcentration', token: 'hero' });
    expect(tok('goblin').elevation ?? 0).toBe(0);
    expect(tok('goblin').hp).toBeLessThan(7);
  });
});

describe('compulsion', () => {
  it('the caster steers the goblin, which walks there as its turn starts', () => {
    const ana = join_('ana');
    const gm = join_('gm');
    dice = [face(20), face(1)];
    gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
    dice = [face(1)];
    ana.receive({ t: 'cast', caster: 'hero', spell: 'compulsion', slot: 4, targets: ['goblin'] });
    expect(ana.take('error')).toEqual([]);
    store.setToken({ ...tok('goblin'), x: 150, y: 250 });
    ana.receive({
      t: 'cast',
      caster: 'hero',
      spell: 'compulsion',
      slot: 4,
      targets: [],
      point: [250, 250],
      repeat: true,
    });
    expect(ana.take('error')).toEqual([]);
    ana.receive({ t: 'endTurn' });
    expect(tok('goblin').x).toBe(250);
  });
});
