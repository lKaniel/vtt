// Time stop: its caster takes 1d4 + 1 turns in a row, until it affects someone else.
import { TokenSchema } from '@vtt/system-dnd5e';
import { currentTurn } from '@vtt/system-dnd5e';
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
      stats: { class: 'wizard', level: 17, abilities: { int: 18 }, spells: ['time-stop', 'magic-missile'] },
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

/** The wizard goes first and stops time, rolling 2 on the d4: three turns in a row. */
function stopTime(): FakeSocket {
  const ana = join_('ana');
  dice = [face(20), face(1)];
  join_('gm').receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
  dice = [face(2, 4)];
  ana.receive({ t: 'cast', caster: 'hero', spell: 'time-stop', slot: 9, targets: [] });
  expect(ana.take('error')).toEqual([]);
  return ana;
}

describe('time stop', () => {
  it('gives its caster 1d4 + 1 more turns before anyone else acts', () => {
    const ana = stopTime();
    for (let i = 0; i < 3; i++) {
      ana.receive({ t: 'endTurn' });
      expect(currentTurn(store.combat!)).toBe('hero');
      expect(store.combat!.left.action).toBe(true);
    }
    ana.receive({ t: 'endTurn' });
    expect(currentTurn(store.combat!)).toBe('goblin');
  });

  it('ends when the caster affects another creature', () => {
    const ana = stopTime();
    ana.receive({ t: 'endTurn' });
    ana.receive({ t: 'cast', caster: 'hero', spell: 'magic-missile', slot: 1, targets: ['goblin'] });
    expect(store.tokens.get('hero')!.effects?.some((e) => e.extraTurns)).toBeFalsy();
    ana.receive({ t: 'endTurn' });
    expect(currentTurn(store.combat!)).toBe('goblin');
  });
});
