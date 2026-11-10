import { type Token, TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';

// Casting with a feature's use instead of a slot (Feature `freeCasts`):
// the player picks what pays, the server checks it and spends it.

let store: GameStore;
let game: Game;

const put = (data: object) => store.setToken(TokenSchema.parse(data));
const tok = (id: string): Token => store.tokens.get(id)!;
const spellLogs = (ws: FakeSocket) => ws.take('chat').flatMap((m) => (m.message.spell ? [m.message.spell] : []));
const errors = (ws: FakeSocket) => ws.take('error').map((m) => m.message);

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  game = new Game(store, { rng: () => 0.5 });
  // Ana's hero is a 2024 ranger with favored enemy and one 1st-level slot already spent of two.
  put({
    ...store.tokens.get('hero'),
    id: 'hero',
    name: 'Ranger',
    x: 50,
    y: 50,
    darkvision: 60,
    stats: { rules: '2024', class: 'ranger', level: 2, maxHp: 20, abilities: { wis: 14, dex: 16 } },
    spent: { slots: [1] },
  });
  put({ ...store.tokens.get('goblin'), x: 250, y: 50, monster: 'goblin' });
});

afterEach(async () => {
  await store.flush();
});

function join(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  ws.take('welcome');
  return ws;
}

describe('casting with a feature instead of a slot', () => {
  it('spends a use of favored enemy, not a slot, and says so in the log', () => {
    const ana = join('ana');
    ana.receive({
      t: 'cast',
      caster: 'hero',
      spell: 'hunters-mark',
      slot: 1,
      paidBy: 'favored-enemy',
      targets: ['goblin'],
    });
    expect(spellLogs(ana)[0]!.notes).toContain('cast with Favored Enemy');
    expect(tok('hero').spent).toEqual({ slots: [1], uses: { 'favored-enemy': 1 } });
  });

  it('refuses once the feature has no uses left, and a feature that doesn’t cast that spell', () => {
    const ana = join('ana');
    store.setToken({ ...tok('hero'), spent: { uses: { 'favored-enemy': 2 } } });
    const cast = { t: 'cast', caster: 'hero', slot: 1, targets: ['goblin'] } as const;
    ana.receive({ ...cast, spell: 'hunters-mark', paidBy: 'favored-enemy' });
    ana.receive({ ...cast, spell: 'cure-wounds', paidBy: 'favored-enemy' });
    expect(errors(ana)).toEqual([
      'Ranger has no uses left of Favored Enemy',
      "Ranger can't cast Cure Wounds with Favored Enemy",
    ]);
  });

  it('casts at the level the feature gives, whatever slot was asked for', () => {
    const ana = join('ana');
    ana.receive({
      t: 'cast',
      caster: 'hero',
      spell: 'hunters-mark',
      slot: 3,
      paidBy: 'favored-enemy',
      targets: ['goblin'],
    });
    expect(spellLogs(ana)[0]).toMatchObject({ slot: 1 });
  });

  it('lands a self-only free cast on the caster (armor of shadows)', () => {
    put({
      ...tok('hero'),
      stats: {
        rules: '2014',
        class: 'warlock',
        level: 2,
        maxHp: 20,
        abilities: { cha: 16, dex: 14 },
        features: ['warlock/armor-of-shadows'],
      },
      spent: { slots: [2] },
    });
    const ana = join('ana');
    ana.receive({
      t: 'cast',
      caster: 'hero',
      spell: 'mage-armor',
      slot: 1,
      paidBy: 'armor-of-shadows',
      targets: ['goblin'],
    });
    expect(errors(ana)).toEqual([]);
    expect(tok('hero').effects?.map((e) => e.name)).toContain('Mage Armor');
    expect(tok('goblin').effects ?? []).toEqual([]);
    expect(tok('hero').spent).toEqual({ slots: [2] });
  });
});
