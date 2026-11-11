import { TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';

let store: GameStore;
let game: Game;
let dice: number[];

const d20 = (face: number) => (face - 1) / 20 + 0.001;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  const hero = store.tokens.get('hero')!;
  store.setToken(
    TokenSchema.parse({
      ...hero,
      x: 650,
      y: 150,
      stats: { class: 'fighter', level: 1, maxHp: 12, abilities: { str: 16 } },
    }),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), x: 550, y: 150, monster: 'goblin', hp: 7 }));
  store.setToken(
    TokenSchema.parse({
      id: 'ally',
      name: 'Ally',
      x: 450,
      y: 150,
      monster: 'guard',
      ownership: { default: 'limited', bo: 'owner' },
    }),
  );
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

/** The hero punches the goblin, rolling a 2 then a 19. */
function punch(): number {
  const ana = join_('ana');
  dice = [d20(2), d20(19)];
  ana.receive({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Unarmed Strike' });
  expect(ana.take('error')).toEqual([]);
  return store.tokens.get('goblin')!.hp ?? 7;
}

describe('Flanking', () => {
  it('is off unless the GM turns it on', () => {
    expect(punch()).toBe(7);
  });

  it('gives a melee attacker advantage with an ally on the far side of the target', () => {
    join_('gm').receive({ t: 'gameSettings', settings: { flanking: 'on' } });
    expect(punch()).toBeLessThan(7);
  });

  it('needs the ally able to act', () => {
    join_('gm').receive({ t: 'gameSettings', settings: { flanking: 'on' } });
    const ally = store.tokens.get('ally')!;
    store.setToken({ ...ally, effects: [{ id: 'stun', name: 'Stunned', conditions: ['stunned'] }] });
    expect(punch()).toBe(7);
  });
});
