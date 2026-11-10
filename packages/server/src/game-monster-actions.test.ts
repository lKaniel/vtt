import { TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';

let store: GameStore;
let game: Game;
let dice: number[];

const d20 = (face: number) => (face - 1) / 20 + 0.001;
const d6 = (face: number) => (face - 0.5) / 6;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      x: 850,
      y: 550,
      stats: { class: 'fighter', level: 10, maxHp: 200, abilities: { dex: 10 } },
    }),
  );
  store.setToken(
    TokenSchema.parse({ ...store.tokens.get('goblin'), x: 550, y: 550, name: 'Dragon', monster: 'adult-red-dragon' }),
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

/** A fight where the dragon goes first. */
function fight(): { gm: FakeSocket; ana: FakeSocket } {
  const gm = join_('gm');
  const ana = join_('ana');
  dice = [d20(2), d20(20)];
  gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
  expect(store.combat!.order[store.combat!.turn]!.token).toBe('goblin');
  return { gm, ana };
}

const dragon = () => store.tokens.get('goblin')!;
const hero = () => store.tokens.get('hero')!;
const chat = (ws: FakeSocket) => ws.take('chat').map((m) => JSON.stringify(m));

describe("a monster's breath weapon", () => {
  it('is breathed over an area for a saving throw against its own DC, and is then spent', () => {
    const { gm } = fight();
    dice = [d20(1)];
    gm.receive({ t: 'feature', token: 'goblin', feature: 'fire-breath', targets: [], point: [850, 550] });
    const said = chat(gm);
    expect(said.some((m) => m.includes('Fire Breath') && m.includes('"dc":21'))).toBe(true);
    expect(hero().hp).toBeLessThan(200);
    expect(dragon().spent?.uses?.['fire-breath']).toBe(1);
    gm.receive({ t: 'feature', token: 'goblin', feature: 'fire-breath', targets: [], point: [850, 550] });
    expect(gm.take('error')[0]?.message).toMatch(/no uses left/);
  });

  it('recharges on a 5 or 6 as its turn starts, and says so', () => {
    const { gm, ana } = fight();
    gm.receive({ t: 'feature', token: 'goblin', feature: 'fire-breath', targets: [], point: [850, 550] });
    gm.receive({ t: 'endTurn' });
    gm.take('chat');
    dice = [d6(4)];
    ana.receive({ t: 'endTurn' });
    expect(dragon().spent?.uses?.['fire-breath']).toBe(1);
    gm.receive({ t: 'endTurn' });
    dice = [d6(5)];
    ana.receive({ t: 'endTurn' });
    expect(dragon().spent?.uses?.['fire-breath']).toBeUndefined();
    expect(chat(gm).some((m) => m.includes('Dragon recharges Fire Breath'))).toBe(true);
  });
});

describe("a monster's Multiattack", () => {
  it('gives it that many attacks with one action', () => {
    const { gm } = fight();
    for (let i = 0; i < 3; i++) {
      dice = [d20(10)];
      gm.receive({ t: 'attack', attacker: 'goblin', target: 'hero', attack: 'Tail' });
      expect(gm.take('error')).toEqual([]);
    }
    gm.receive({ t: 'attack', attacker: 'goblin', target: 'hero', attack: 'Tail' });
    expect(gm.take('error')[0]?.message).toBeTruthy();
  });
});
