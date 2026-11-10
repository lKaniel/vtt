import { currentTurn, TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './store/game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// Turn overrides: the GM, and a trusted player on a creature they control,
// give back (or take away) an action, a bonus action, a reaction or
// movement mid-fight, and set its initiative by hand.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  for (const id of ['hero', 'goblin'])
    store.setToken(TokenSchema.parse({ ...store.tokens.get(id), monster: 'goblin' }));
  const world = store.world;
  store.setWorld({ ...world, players: world.players.map((p) => (p.id === 'ana' ? { ...p, role: 'trusted' } : p)) });
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

/** A fight with only the hero in it, its action and bonus action spent and its reaction used. */
function spentHero(gm: FakeSocket): void {
  gm.receive({ t: 'combatStart', tokens: ['hero'] });
  const fight = store.combat!;
  store.setCombat({ ...fight, left: { ...fight.left, action: false, bonus: false, move: 0 }, reacted: ['hero'] });
}

describe('turn overrides', () => {
  it('give a trusted player’s creature back its action, bonus action, reaction and movement', () => {
    const [gm, ana] = [seat('gm'), seat('ana')];
    spentHero(gm);
    ana.receive({ t: 'turnOverride', token: 'hero', action: true, bonus: true, reaction: true, move: 60 });
    expect(ana.take('error')).toEqual([]);
    expect(store.combat!.left).toMatchObject({ action: true, bonus: true, move: 60 });
    expect(store.combat!.reacted).toEqual([]);
  });

  it('take them away again, and say so in the chat', () => {
    const gm = seat('gm');
    gm.receive({ t: 'combatStart', tokens: ['hero'] });
    gm.receive({ t: 'turnOverride', token: 'hero', action: false, reaction: false });
    expect(store.combat!.left.action).toBe(false);
    expect(store.combat!.reacted).toEqual(['hero']);
    const said = gm.take('chat').map((m) => JSON.stringify(m));
    expect(said.some((m) => m.includes('Hero') && /override/i.test(m))).toBe(true);
  });

  it('are not a plain player’s', () => {
    const [gm, bo] = [seat('gm'), seat('bo')];
    const world = store.world;
    store.setWorld({ ...world, players: world.players.map((p) => (p.id === 'ana' ? { ...p, role: 'player' } : p)) });
    const ana = seat('ana');
    spentHero(gm);
    const before = store.combat;
    ana.receive({ t: 'turnOverride', token: 'hero', action: true });
    bo.receive({ t: 'turnOverride', token: 'hero', action: true });
    expect(ana.take('error')).toHaveLength(1);
    expect(bo.take('error')).toHaveLength(1);
    expect(store.combat).toEqual(before);
  });

  it('are not a trusted player’s on a creature they don’t control', () => {
    const [gm, ana] = [seat('gm'), seat('ana')];
    gm.receive({ t: 'combatStart', tokens: ['goblin'] });
    ana.receive({ t: 'turnOverride', token: 'goblin', reaction: true });
    expect(ana.take('error')).toHaveLength(1);
  });

  it('change an action only on the creature’s own turn, all or nothing; a reaction any time in the fight', () => {
    const [gm, ana] = [seat('gm'), seat('ana')];
    gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
    if (currentTurn(store.combat!) === 'hero') gm.receive({ t: 'endTurn' });
    store.setCombat({ ...store.combat!, reacted: ['hero'] });
    ana.receive({ t: 'turnOverride', token: 'hero', action: true, reaction: true });
    expect(ana.take('error')[0]?.message).toMatch(/turn/);
    expect(store.combat!.reacted).toEqual(['hero']);
    ana.receive({ t: 'turnOverride', token: 'hero', reaction: true });
    expect(store.combat!.reacted).toEqual([]);
  });

  it('need a fight the creature is in', () => {
    const ana = seat('ana');
    ana.receive({ t: 'turnOverride', token: 'hero', action: true });
    expect(ana.take('error')[0]?.message).toMatch(/not in the fight/);
  });
});

describe('initiative set by hand', () => {
  it('is a trusted player’s on their own creature', () => {
    const [gm, ana] = [seat('gm'), seat('ana')];
    gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
    ana.receive({ t: 'initiative', token: 'hero', value: 30 });
    expect(store.combat?.order[0]).toEqual({ token: 'hero', initiative: 30 });
    ana.receive({ t: 'initiative', token: 'goblin', value: 31 });
    expect(ana.take('error')).toHaveLength(1);
  });
});
