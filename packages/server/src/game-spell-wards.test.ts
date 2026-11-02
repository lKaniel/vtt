// Spells that guard a creature or take one away: mirror image, sanctuary, and
// banishment (the creature leaves the map while the spell lasts).
import { type Token, TokenSchema } from '@vtt/system-dnd5e';
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
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  // Ana's 9th-level cleric-wizard, a goblin in front of them.
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      x: 150,
      y: 150,
      darkvision: 60,
      stats: {
        class: 'wizard',
        level: 9,
        maxHp: 60,
        abilities: { int: 20, wis: 16, dex: 10 },
        spells: ['mirror-image', 'sanctuary', 'banishment'],
      },
      inventory: [{ item: 'dagger', equipped: true }],
    }),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), x: 250, y: 150, monster: 'goblin' }));
});

afterEach(async () => {
  await store.flush();
});

const d20 = (face: number) => (face - 1) / 20 + 0.001;
const tok = (id: string): Token => store.tokens.get(id)!;

function join_(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  ws.take('welcome');
  return ws;
}

describe('mirror image', () => {
  it('a hit turned on a duplicate destroys it and leaves the caster unhurt', () => {
    const ana = join_('ana');
    const gm = join_('gm');
    ana.receive({ t: 'cast', caster: 'hero', spell: 'mirror-image', slot: 2, targets: [] });
    expect(tok('hero').effects?.find((e) => e.images)?.images).toBe(3);
    // The goblin's scimitar hits on 19, rolls 4 damage, then a 6 on the duplicates' d20.
    dice = [d20(19), 0.5, d20(6), d20(20)];
    gm.receive({ t: 'attack', attacker: 'goblin', target: 'hero', attack: 'Scimitar' });
    expect(tok('hero').effects?.find((e) => e.images)?.images).toBe(2);
    expect(tok('hero').hp).toBeUndefined();
  });
});

describe('sanctuary', () => {
  it('an attacker that fails its Wisdom save has to pick another target', () => {
    const ana = join_('ana');
    const gm = join_('gm');
    ana.receive({ t: 'cast', caster: 'hero', spell: 'sanctuary', slot: 1, targets: ['hero'] });
    dice = [d20(2)];
    gm.receive({ t: 'attack', attacker: 'goblin', target: 'hero', attack: 'Scimitar' });
    expect(gm.take('error')[0]!.message).toMatch(/Sanctuary/);
    expect(tok('hero').hp).toBeUndefined();
  });

  it('ends when the warded creature attacks', () => {
    const ana = join_('ana');
    ana.receive({ t: 'cast', caster: 'hero', spell: 'sanctuary', slot: 1, targets: ['hero'] });
    store.setToken({ ...tok('goblin'), x: 200 });
    ana.receive({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Dagger' });
    expect(tok('hero').effects?.some((e) => e.sanctuary !== undefined)).toBe(false);
  });
});

describe('banishment', () => {
  it('takes a creature that fails its save off the map until the spell ends', () => {
    const ana = join_('ana');
    dice = [d20(2)];
    ana.receive({ t: 'cast', caster: 'hero', spell: 'banishment', slot: 4, targets: ['goblin'] });
    expect(tok('goblin').hidden).toBe(true);
    ana.receive({ t: 'dropConcentration', token: 'hero' });
    expect(tok('goblin').hidden).toBe(false);
  });

  it('leaves a creature the GM hid hidden when the spell ends', () => {
    store.setToken({ ...tok('goblin'), hidden: true });
    const gm = join_('gm');
    dice = [d20(2)];
    gm.receive({ t: 'cast', caster: 'hero', spell: 'banishment', slot: 4, targets: ['goblin'] });
    expect(tok('goblin').effects?.length).toBeGreaterThan(0);
    gm.receive({ t: 'dropConcentration', token: 'hero' });
    expect(tok('goblin').hidden).toBe(true);
  });
});
