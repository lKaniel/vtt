import { TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// The token HUD's actions (conditions, joining or leaving the fight) and
// the GM pausing the game.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  for (const id of ['hero', 'goblin'])
    store.setToken(TokenSchema.parse({ ...store.tokens.get(id), monster: 'goblin' }));
  game = new Game(store, { rng: () => 0.5 });
});

afterEach(async () => {
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  ws.sent = [];
  return ws;
}

const conditionsOf = (id: string) => (store.tokens.get(id)!.effects ?? []).flatMap((e) => e.conditions ?? []);

describe('conditions from the HUD', () => {
  it('are toggled on a creature its controller or the GM picks', () => {
    const [ana, gm] = [seat('ana'), seat('gm')];
    ana.receive({ t: 'condition', token: 'hero', condition: 'prone', on: true });
    expect(conditionsOf('hero')).toEqual(['prone']);
    ana.receive({ t: 'condition', token: 'hero', condition: 'prone', on: true });
    expect(conditionsOf('hero')).toEqual(['prone']);
    gm.receive({ t: 'condition', token: 'hero', condition: 'prone', on: false });
    expect(conditionsOf('hero')).toEqual([]);
  });

  it('may not be put on a creature the player doesn’t control', () => {
    const ana = seat('ana');
    ana.receive({ t: 'condition', token: 'goblin', condition: 'stunned', on: true });
    expect(ana.take('error')).toHaveLength(1);
    expect(conditionsOf('goblin')).toEqual([]);
  });

  it('come off whatever gave them', () => {
    const hero = store.tokens.get('hero')!;
    store.setToken({ ...hero, effects: [{ id: 'web', name: 'Web', conditions: ['restrained'] }] });
    const gm = seat('gm');
    gm.receive({ t: 'condition', token: 'hero', condition: 'restrained', on: false });
    expect(conditionsOf('hero')).toEqual([]);
  });
});

describe('the fight from the HUD', () => {
  it('starts one with the creature, adds others by initiative, and takes them out', () => {
    const gm = seat('gm');
    gm.receive({ t: 'combatant', token: 'hero', on: true });
    expect(store.combat?.order.map((e) => e.token)).toEqual(['hero']);
    gm.receive({ t: 'combatant', token: 'goblin', on: true });
    expect(store.combat?.order.map((e) => e.token).sort()).toEqual(['goblin', 'hero']);
    gm.receive({ t: 'combatant', token: 'hero', on: false });
    expect(store.combat?.order.map((e) => e.token)).toEqual(['goblin']);
  });

  it('is the GM’s', () => {
    const ana = seat('ana');
    ana.receive({ t: 'combatant', token: 'hero', on: true });
    expect(ana.take('error')).toHaveLength(1);
    expect(store.combat).toBeUndefined();
  });
});

describe('pausing', () => {
  it('stops the players acting, not the GM, and tells everyone', () => {
    const [ana, gm] = [seat('ana'), seat('gm')];
    gm.receive({ t: 'pause', on: true });
    expect(ana.take('paused')).toEqual([{ t: 'paused', on: true }]);
    ana.receive({ t: 'move', token: 'hero', to: [150, 250] });
    expect(ana.take('error')[0]?.message).toMatch(/paused/i);
    expect(store.tokens.get('hero')!.y).toBe(150);
    ana.receive({ t: 'chat', text: 'hello' });
    expect(ana.take('chat')).toHaveLength(1);
    gm.receive({ t: 'move', token: 'hero', to: [150, 250] });
    expect(store.tokens.get('hero')!.y).toBe(250);
    gm.receive({ t: 'pause', on: false });
    ana.receive({ t: 'move', token: 'hero', to: [150, 150] });
    expect(store.tokens.get('hero')!.y).toBe(150);
  });

  it('is in the welcome, and only the GM pauses', () => {
    const [ana, gm] = [seat('ana'), seat('gm')];
    ana.receive({ t: 'pause', on: true });
    expect(ana.take('error')).toHaveLength(1);
    gm.receive({ t: 'pause', on: true });
    const late = new FakeSocket();
    game.connect(late.asWebSocket, game.findPlayer('bo')!);
    expect(late.take('welcome')[0]?.paused).toBe(true);
  });
});
