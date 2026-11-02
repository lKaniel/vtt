// Polymorph and its kin on the server: the caster picks a form, the target
// takes its stat block, and in 2014 it changes back at 0 hit points with the
// leftover damage carried over.
import { type Token, TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';

let store: GameStore;
let game: Game;
let dice: number[];

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      x: 150,
      y: 150,
      darkvision: 60,
      stats: {
        class: 'wizard',
        level: 9,
        maxHp: 50,
        abilities: { int: 20 },
        spells: ['polymorph'],
      },
    }),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), x: 250, y: 150, monster: 'ogre' }));
});

afterEach(async () => {
  await store.flush();
});

const d20 = (face: number) => (face - 1) / 20 + 0.001;
const tok = (id: string): Token => store.tokens.get(id)!;

function join_(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  ws.take('welcome');
  return ws;
}

describe('polymorph', () => {
  it('turns a creature that fails its save into the beast picked', () => {
    const ana = join_('ana');
    dice = [d20(2)];
    ana.receive({ t: 'cast', caster: 'hero', spell: 'polymorph', slot: 4, targets: ['goblin'], form: 'cat' });
    expect(ana.take('error')).toEqual([]);
    expect(game.table.sheetOf(tok('goblin'))).toMatchObject({ maxHp: 2, type: 'beast' });
  });

  it('refuses a form above the target’s challenge rating', () => {
    const ana = join_('ana');
    ana.receive({ t: 'cast', caster: 'hero', spell: 'polymorph', slot: 4, targets: ['goblin'], form: 'giant-ape' });
    expect(ana.take('error')[0]!.message).toMatch(/challenge rating/);
  });

  it('a polymorphed creature dropped to 0 changes back, and the leftover damage carries over', () => {
    const ana = join_('ana');
    dice = [d20(2)];
    ana.receive({ t: 'cast', caster: 'hero', spell: 'polymorph', slot: 4, targets: ['goblin'], form: 'cat' });
    game.table.hurt(tok('goblin'), { hp: 0 }, 5);
    expect(formless(tok('goblin'))).toBe(true);
    // The ogre had 59; 2 went on the cat, 3 carry over.
    expect(tok('goblin').hp).toBe(56);
  });

  it('changes back with its own hit points when the caster stops concentrating', () => {
    store.setToken({ ...tok('goblin'), hp: 40 });
    const ana = join_('ana');
    dice = [d20(2)];
    ana.receive({ t: 'cast', caster: 'hero', spell: 'polymorph', slot: 4, targets: ['goblin'], form: 'cat' });
    expect(tok('goblin').hp).toBeUndefined();
    ana.receive({ t: 'dropConcentration', token: 'hero' });
    expect(tok('goblin').hp).toBe(40);
    expect(game.table.sheetOf(tok('goblin'))!.type).toBe('giant');
  });
});

const formless = (t: Token) => !(t.effects ?? []).some((e) => e.form) && !t.trueForm;
