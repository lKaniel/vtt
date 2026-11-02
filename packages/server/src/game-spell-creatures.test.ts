// Summons whose stat block comes with the spell (2024 giant insect, animated
// objects): each token carries the stat block built for the slot it was cast with.
import { type Token, TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  game = new Game(store, { rng: () => 0.5 });
});

afterEach(async () => {
  await store.flush();
});

function caster(stats: object): FakeSocket {
  store.setToken(TokenSchema.parse({ ...store.tokens.get('hero'), x: 150, y: 150, darkvision: 60, stats }));
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer('ana')!);
  ws.take('welcome');
  return ws;
}

const summoned = (spell: string): Token[] => [...store.tokens.values()].filter((t) => t.summon?.spell === spell);

describe('a spell’s own creatures', () => {
  it('2024 giant insect: a wasp built for the slot, attacking with the caster’s spell attack', () => {
    const ana = caster({
      class: 'druid',
      level: 7,
      rules: '2024',
      maxHp: 40,
      abilities: { wis: 18 },
      spells: ['giant-insect'],
    });
    ana.receive({
      t: 'cast',
      caster: 'hero',
      spell: 'giant-insect',
      slot: 4,
      targets: [],
      point: [250, 150],
      summon: 'insect-wasp',
    });
    expect(ana.take('error')).toEqual([]);
    const [wasp] = summoned('giant-insect');
    expect(wasp).toMatchObject({ name: 'Giant Wasp', monster: 'insect-wasp', size: 2 });
    const sheet = game.table.sheetOf(wasp!)!;
    expect(sheet).toMatchObject({ ac: 15, maxHp: 30, attacksPerAction: 2 });
    expect(sheet.attacks[0]).toMatchObject({ name: 'Poison Jab', toHit: 7 });
  });

  it('2014 animate objects: ten tiny objects at 5th level', () => {
    const ana = caster({ class: 'wizard', level: 9, maxHp: 40, abilities: { int: 18 }, spells: ['animate-objects'] });
    ana.receive({
      t: 'cast',
      caster: 'hero',
      spell: 'animate-objects',
      slot: 5,
      targets: [],
      point: [250, 150],
      summon: 'object-tiny',
    });
    expect(ana.take('error')).toEqual([]);
    const objects = summoned('animate-objects');
    expect(objects).toHaveLength(10);
    expect(game.table.sheetOf(objects[0]!)).toMatchObject({ ac: 18, maxHp: 20 });
  });
});
