import { TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './game-store.ts';

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  game = new Game(store, { rng: () => 0.5 });
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      hp: 10,
      stats: { class: 'fighter', level: 3, abilities: { con: 14 } },
    }),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), monster: 'goblin' }));
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

const hero = () => store.tokens.get('hero')!;

describe('hit dice', () => {
  it('lets the owner spend one and heal', () => {
    join_('ana').receive({ t: 'hitDie', token: 'hero' });
    expect(hero().hp).toBe(18);
    expect(hero().spent?.hitDice).toBe(1);
  });

  it("can't be spent in a fight", () => {
    const gm = join_('gm');
    gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
    const ana = join_('ana');
    ana.receive({ t: 'hitDie', token: 'hero' });
    expect(ana.take('error')[0]?.message).toMatch(/fight/);
    expect(hero().spent?.hitDice).toBeUndefined();
  });
});

describe('exhaustion', () => {
  it('is set by the GM only', () => {
    join_('ana').receive({ t: 'exhaustion', token: 'hero', level: 3 });
    expect(hero().exhaustion).toBeUndefined();
    const gm = join_('gm');
    gm.receive({ t: 'exhaustion', token: 'hero', level: 3 });
    expect(hero().exhaustion).toBe(3);
    gm.receive({ t: 'exhaustion', token: 'hero', level: 0 });
    expect(hero().exhaustion).toBeUndefined();
  });
});

describe('experience', () => {
  it('is awarded by the GM to each character named, and says who can level up', () => {
    store.setToken(TokenSchema.parse({ ...hero(), stats: { ...hero().stats, xp: 2600 } }));
    join_('ana').receive({ t: 'awardXp', tokens: ['hero'], xp: 100 });
    expect(hero().stats?.xp).toBe(2600);
    const gm = join_('gm');
    gm.receive({ t: 'awardXp', tokens: ['hero'], xp: 100 });
    expect(hero().stats?.xp).toBe(2700);
    expect(JSON.stringify(gm.take('chat'))).toMatch(/Hero gains 100 XP.*can reach level 4/);
    gm.receive({ t: 'awardXp', tokens: ['goblin'], xp: 50 });
    expect(gm.take('error')[0]?.message).toMatch(/characters/);
  });
});
