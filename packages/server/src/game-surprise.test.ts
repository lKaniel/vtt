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

const hidden = (stealth: number) => [
  { id: 'hide-goblin', name: 'Hidden', advantage: true, endsOnAttack: true, hidden: stealth, source: 'goblin' },
];

describe('Surprise (2014)', () => {
  it('a creature that notices no foe at the start of a fight is surprised: no move, action or reaction on its first turn', () => {
    const gm = join_('gm');
    const ana = join_('ana');
    store.setToken({ ...store.tokens.get('goblin')!, effects: hidden(25) });
    // The hero rolls 20 and goes first, yet is surprised.
    dice = [d20(20), d20(2)];
    gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
    expect(gm.take('chat').some((m) => JSON.stringify(m).includes('Hero is surprised'))).toBe(true);
    expect(store.combat!.left).toMatchObject({ move: 0, action: false, bonus: false });
    expect(store.combat!.reacted).toContain('hero');
    ana.receive({ t: 'endTurn' });
    gm.receive({ t: 'endTurn' });
    // Its next turn is a normal one.
    expect(store.combat!.left).toMatchObject({ move: 30, action: true });
  });

  it('no one is surprised when a foe is in plain sight', () => {
    const gm = join_('gm');
    store.setToken({ ...store.tokens.get('goblin')!, effects: hidden(5) });
    dice = [d20(20), d20(2)];
    gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
    expect(store.combat!.left).toMatchObject({ move: 30, action: true });
  });

  it('the GM can name the surprised creatures', () => {
    const gm = join_('gm');
    dice = [d20(20), d20(2)];
    gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin'], surprised: ['hero'] });
    expect(store.combat!.left).toMatchObject({ move: 0, action: false });
  });
});

describe('Surprise (2024)', () => {
  it('a surprised creature rolls initiative with disadvantage instead', () => {
    const gm = join_('gm');
    const hero = store.tokens.get('hero')!;
    store.setToken({ ...hero, stats: { ...hero.stats, rules: '2024' } });
    // The hero rolls 20 and 3, keeps the 3; the goblin rolls 10.
    dice = [d20(20), d20(3), d20(10)];
    gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin'], surprised: ['hero'] });
    expect(store.combat!.order[0]!.token).toBe('goblin');
    expect(store.combat!.left).toMatchObject({ action: true });
  });
});
