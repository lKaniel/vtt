import { type Token, TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './store/game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// Lasting spells that change the map: darkness puts magical darkness where it
// was cast, a wall of force stands as walls, and both go when the spell ends.

let store: GameStore;
let game: Game;
const tok = (id: string): Token => store.tokens.get(id)!;
const spellLights = () => store.docs.all('main/lights').filter((d) => d.id.startsWith('zone-'));
const spellWalls = () => store.docs.all('main/walls').filter((d) => d.id.startsWith('zone-'));

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  game = new Game(store, { rng: () => 0.5 });
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      x: 50,
      y: 150,
      darkvision: 120,
      stats: {
        class: 'wizard',
        level: 9,
        maxHp: 40,
        abilities: { int: 18 },
        spells: ['darkness', 'wall-of-force'],
      },
    }),
  );
});

afterEach(async () => {
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  return ws;
}

describe('spells that change the map', () => {
  it('darkness puts magical darkness where it was cast, gone when the spell ends', () => {
    const ana = seat('ana');
    ana.receive({ t: 'cast', caster: 'hero', spell: 'darkness', slot: 2, targets: [], point: [250, 150] });
    expect(ana.take('error')).toEqual([]);
    expect(spellLights()).toMatchObject([{ x: 250, y: 150, bright: 15, darkness: true }]);
    ana.receive({ t: 'dropConcentration', token: 'hero' });
    expect(spellLights()).toEqual([]);
    expect(tok('hero').concentration).toBeUndefined();
  });

  it('a wall of force stands as walls while the caster keeps it up', () => {
    const ana = seat('ana');
    ana.receive({ t: 'cast', caster: 'hero', spell: 'wall-of-force', slot: 5, targets: [], point: [250, 150] });
    expect(spellWalls()).toMatchObject([{ a: [250, 1150], b: [250, -850], sight: 'none' }]);
    ana.receive({ t: 'dropConcentration', token: 'hero' });
    expect(spellWalls()).toEqual([]);
  });

  it('the dome option rings the point with wall', () => {
    const ana = seat('ana');
    ana.receive({
      t: 'cast',
      caster: 'hero',
      spell: 'wall-of-force',
      slot: 5,
      targets: [],
      point: [250, 150],
      choice: 'dome',
    });
    expect(spellWalls()).toHaveLength(16);
  });
});
