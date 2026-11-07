// 2024 spells that work through blows: true strike's attack, resistance's
// ward once a turn, and dragon's breath handed to another creature.
import { type Effect, TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';

let store: GameStore;
let game: Game;
let dice: number[];

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  store.setWorld({ ...store.world, rules: '2024' });
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      x: 150,
      y: 150,
      darkvision: 60,
      stats: {
        class: 'sorcerer',
        level: 5,
        abilities: { cha: 18, str: 10 },
        spells: ['true-strike', 'dragons-breath'],
      },
      inventory: [{ item: 'dagger', equipped: true }],
    }),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), x: 250, y: 150, monster: 'goblin-warrior' }));
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

const tok = (id: string) => store.tokens.get(id)!;
const d20 = (face: number) => (face - 1) / 20 + 0.001;

function fight(first: string): void {
  // The first in initiative rolls high.
  dice = first === 'hero' ? [d20(20), d20(1)] : [d20(1), d20(20)];
  join_('gm').receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
}

describe('true strike', () => {
  it('casting it gives one weapon attack on top, with radiant damage', () => {
    const ana = join_('ana');
    fight('hero');
    ana.receive({ t: 'cast', caster: 'hero', spell: 'true-strike', slot: 0, targets: [] });
    expect(ana.take('error').map((e) => e.message)).toEqual([]);
    dice = [d20(19)];
    ana.receive({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Dagger' });
    const log = ana
      .take('chat')
      .map((m) => m.message.attack)
      .find(Boolean);
    expect(log?.parts.map((p) => p.type)).toContain('radiant');
    expect(tok('hero').effects?.some((e) => e.weaponSpell)).toBeFalsy();
    ana.receive({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Dagger' });
    expect(ana.take('error')[0]?.message).toBeDefined();
  });
});

describe('resistance', () => {
  it('takes a d4 off the first hit of the type each turn', () => {
    const gm = join_('gm');
    const ward: Effect = { id: 'res', name: 'Resistance', ward: { dice: '1d4', types: ['slashing'] }, source: 'hero' };
    store.setToken({ ...tok('hero'), effects: [ward] });
    fight('goblin');
    dice = [d20(19), 0.99, 0.99];
    gm.receive({ t: 'attack', attacker: 'goblin', target: 'hero', attack: 'Scimitar' });
    expect(tok('hero').effects?.find((e) => e.id === 'res')?.wardUsed).toBe(true);
  });
});

describe("dragon's breath", () => {
  it('the creature touched exhales a cone on its own turn with the caster’s DC', () => {
    const ana = join_('ana');
    const bo = join_('bo');
    store.setToken(
      TokenSchema.parse({
        id: 'friend',
        name: 'Friend',
        x: 150,
        y: 250,
        ownership: { default: 'limited', bo: 'owner' },
        stats: { class: 'fighter', level: 1, abilities: { str: 14 } },
      }),
    );
    ana.receive({ t: 'cast', caster: 'hero', spell: 'dragons-breath', slot: 2, targets: ['friend'], choice: 'fire' });
    expect(ana.take('error').map((e) => e.message)).toEqual([]);
    expect(tok('friend').effects?.find((e) => e.repeat)?.repeat).toMatchObject({ dc: 15, choice: 'fire' });
    store.setToken({ ...tok('goblin'), x: 250, y: 250 });
    bo.receive({
      t: 'cast',
      caster: 'friend',
      spell: 'dragons-breath',
      slot: 2,
      targets: [],
      point: [250, 250],
      repeat: true,
    });
    expect(bo.take('error')).toEqual([]);
    expect(tok('goblin').hp).toBeLessThan(10);
  });
});
