import { TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './game-store.ts';

let store: GameStore;
let game: Game;
let dice: number[];

/** A d20 face as the rng value that rolls it. */
const d20 = (face: number) => (face - 1) / 20 + 0.001;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      darkvision: 60,
      stats: { class: 'cleric', level: 5, abilities: { wis: 18, dex: 10 }, spells: ['sacred-flame'] },
    }),
  );
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('goblin'),
      x: 250,
      y: 250,
      name: 'Dragon',
      monster: 'adult-black-dragon',
      stats: { lair: { actions: [{ id: 'quake', name: 'Quake', description: 'The ground shakes.' }] } },
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

/** A fight where the hero goes first (19), then the lair (20 loses ties... the hero rolled above it), then the dragon. */
function fight(): { gm: FakeSocket; ana: FakeSocket } {
  const gm = join_('gm');
  const ana = join_('ana');
  dice = [d20(20), d20(2)];
  gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
  return { gm, ana };
}

const dragon = () => store.tokens.get('goblin')!;
const chat = (ws: FakeSocket) => ws.take('chat').map((m) => JSON.stringify(m));

describe('legendary actions', () => {
  it("are spent on another creature's turn, making their attack", () => {
    const { gm } = fight();
    expect(store.combat!.order.map((e) => e.token)).toEqual(['hero', 'lair:goblin', 'goblin']);
    dice = [d20(20)];
    gm.receive({ t: 'legendary', token: 'goblin', option: 'tail-attack', target: 'hero' });
    expect(dragon().spent?.uses?.legendary).toBe(1);
    expect(store.tokens.get('hero')!.hp).toBeLessThan(38);
    gm.receive({ t: 'legendary', token: 'goblin', option: 'wing-attack' });
    expect(dragon().spent?.uses?.legendary).toBe(3);
    expect(chat(gm).some((m) => m.includes('Wing Attack'))).toBe(true);
    gm.receive({ t: 'legendary', token: 'goblin', option: 'detect' });
    expect(gm.take('error')[0]?.message).toMatch(/left/);
  });

  it('come back when its turn starts, and players cannot use them', () => {
    const { gm, ana } = fight();
    ana.receive({ t: 'legendary', token: 'goblin', option: 'detect' });
    expect(dragon().spent).toBeUndefined();
    gm.receive({ t: 'legendary', token: 'goblin', option: 'detect' });
    ana.receive({ t: 'endTurn' });
    gm.receive({ t: 'endTurn' });
    expect(store.combat!.order[store.combat!.turn]!.token).toBe('goblin');
    expect(dragon().spent?.uses?.legendary).toBeUndefined();
  });
});

describe('lair actions', () => {
  it('are taken by the GM on the lair turn only', () => {
    const { gm, ana } = fight();
    gm.receive({ t: 'lair', token: 'goblin', action: 'quake' });
    expect(gm.take('error')[0]?.message).toMatch(/lair/);
    ana.receive({ t: 'endTurn' });
    ana.receive({ t: 'endTurn' });
    expect(store.combat!.order[store.combat!.turn]!.token).toBe('lair:goblin');
    gm.take('chat');
    gm.receive({ t: 'lair', token: 'goblin', action: 'quake' });
    expect(chat(gm).some((m) => m.includes('ground shakes'))).toBe(true);
  });
});

describe('legendary resistance', () => {
  it('is used up when a failed save becomes a success', () => {
    const { ana } = fight();
    // Sacred flame's 2d8 roll first, then the dragon's save.
    dice = [0.5, 0.5, d20(1)];
    ana.receive({ t: 'cast', caster: 'hero', spell: 'sacred-flame', slot: 0, targets: ['goblin'] });
    expect(ana.take('error')).toEqual([]);
    expect(dragon().spent?.uses?.['legendary-resistance']).toBe(1);
  });
});
