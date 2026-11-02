import { TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// BG3's shared party turns: party members next to each other in the order
// act on one turn, in any order, and it passes on when all have ended theirs.

let store: GameStore;
let game: Game;
let dice: number[];

const d20 = (face: number) => (face - 1) / 20 + 0.001;
const stats = { level: 1, maxHp: 12, abilities: { str: 14, dex: 10 } };

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  store.setToken(TokenSchema.parse({ ...store.tokens.get('hero'), stats }));
  store.setToken(
    TokenSchema.parse({
      id: 'mage',
      name: 'Mage',
      x: 150,
      y: 250,
      ownership: { default: 'limited', bo: 'owner' },
      stats,
    }),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), monster: 'goblin' }));
});

afterEach(async () => {
  await store.flush();
});

function seat(id: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(id)!);
  ws.sent = [];
  return ws;
}

/** Hero, then Mage, then Goblin. */
function fight(shared: boolean) {
  const [gm, ana, bo] = [seat('gm'), seat('ana'), seat('bo')];
  dice = [d20(20), d20(18), d20(2)];
  gm.receive({ t: 'combatStart', tokens: ['hero', 'mage', 'goblin'], ...(shared && { shared }) });
  return { gm, ana, bo };
}

const turn = () => store.combat!.order[store.combat!.turn]!.token;

describe('shared party turns', () => {
  it('lets the party members next in the order act on the same turn', () => {
    const { bo } = fight(true);
    expect(turn()).toBe('hero');
    expect(store.combat?.group).toEqual(['mage']);
    bo.receive({ t: 'move', token: 'mage', to: [150, 150 + 100] });
    bo.receive({ t: 'move', token: 'mage', to: [250, 250] });
    expect(bo.take('error')).toEqual([]);
  });

  it('keeps each to their own turn when the fight doesn’t share them', () => {
    const { bo } = fight(false);
    bo.receive({ t: 'move', token: 'mage', to: [250, 250] });
    expect(bo.take('error')[0]?.message).toMatch(/not Mage's turn/);
  });

  it('passes on once every member has ended their turn, in any order', () => {
    const { ana, bo } = fight(true);
    ana.receive({ t: 'endTurn' });
    expect(turn()).toBe('hero');
    ana.receive({ t: 'move', token: 'hero', to: [250, 150] });
    expect(ana.take('error')[0]?.message).toMatch(/not Hero's turn/);
    bo.receive({ t: 'endTurn' });
    expect(turn()).toBe('goblin');
    expect(store.combat?.group).toBeUndefined();
  });

  it('is how turn-based mode plays', () => {
    const gm = seat('gm');
    dice = [d20(20), d20(18)];
    gm.receive({ t: 'turnBased', on: true });
    expect(store.combat?.group).toHaveLength(1);
  });
});
