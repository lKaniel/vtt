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
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      x: 650,
      y: 150,
      stats: { class: 'fighter', level: 5, maxHp: 50, abilities: { str: 18, wis: 10 } },
    }),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), x: 550, y: 150, monster: 'goblin' }));
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

/** The goblin hides with this d20 face (Stealth +6), then the hero tries to hit it. */
function hideThenAttack(face: number): FakeSocket {
  const gm = join_('gm');
  const ana = join_('ana');
  dice = [d20(face)];
  gm.receive({ t: 'feature', token: 'goblin', feature: 'hide' });
  expect(gm.take('error')).toEqual([]);
  ana.take('error');
  ana.receive({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Unarmed Strike' });
  return ana;
}

describe('Hidden creatures', () => {
  it('keep the Stealth total on their Hidden effect', () => {
    hideThenAttack(14);
    expect(store.tokens.get('goblin')!.effects?.find((e) => e.name === 'Hidden')?.hidden).toBe(20);
  });

  it("drop out of the view of players whose creatures' passive Perception is lower", () => {
    const ana = hideThenAttack(14);
    expect(ana.take('error')[0]?.message).toMatch(/No such target/);
  });

  it('stay in view when a creature of theirs notices them', () => {
    const ana = hideThenAttack(1);
    expect(ana.take('error')).toEqual([]);
  });
});
