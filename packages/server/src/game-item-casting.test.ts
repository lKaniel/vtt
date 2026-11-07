import { type Token, TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';

// Casting from wands and staffs: their charges pay, their DC holds, and a
// long rest gives charges back.

let store: GameStore;
let game: Game;
let dice: number[];

const face = (n: number, sides = 20) => (n - 1) / sides + 0.001;
const tok = (id: string): Token => store.tokens.get(id)!;
const errors = (ws: FakeSocket) => ws.take('error').map((m) => m.message);
const put = (data: object) => store.setToken(TokenSchema.parse(data));

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  put({
    ...tok('hero'),
    darkvision: 60,
    stats: { level: 3, maxHp: 20 },
    inventory: [{ item: 'wand-of-magic-missiles', equipped: true }],
  });
  put({ ...tok('goblin'), monster: 'goblin', x: 250, y: 150 });
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

const missiles = (slot: number) => ({
  t: 'cast' as const,
  caster: 'hero',
  spell: 'magic-missile',
  slot,
  item: 0,
  targets: ['goblin', 'goblin', 'goblin'],
});

describe('casting from a wand', () => {
  it('spends its charges, not a spell slot, even for a creature with no spellcasting', () => {
    const ana = seat('ana');
    dice = [face(1, 4), face(1, 4), face(1, 4)];
    ana.receive(missiles(1));
    expect(errors(ana)).toEqual([]);
    expect(tok('goblin').hp).toBe(7 - 6);
    expect(tok('hero').inventory?.[0]?.spent).toBe(1);
  });

  it('refuses when the charges have run out, and a long rest gives some back', () => {
    put({ ...tok('hero'), inventory: [{ item: 'wand-of-magic-missiles', equipped: true, spent: 7 }] });
    const ana = seat('ana');
    ana.receive(missiles(1));
    expect(errors(ana)).toEqual(['Hero has only 0 charges left in the Wand of Magic Missiles']);
    seat('gm').receive({ t: 'rest', tokens: ['hero'], kind: 'long' });
    expect(tok('hero').inventory?.[0]?.spent ?? 0).toBeLessThan(7);
  });

  it('refuses a wand that is not in hand', () => {
    put({ ...tok('hero'), inventory: [{ item: 'wand-of-magic-missiles' }] });
    const ana = seat('ana');
    ana.receive(missiles(1));
    expect(errors(ana)).toEqual(['Hero needs to hold the Wand of Magic Missiles']);
  });
});
