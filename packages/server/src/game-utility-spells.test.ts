// Utility spells with something to do on the map or at the table: knock and
// arcane lock on the fixture room's east door, and guidance used up by the
// check it helps.
import { TokenSchema } from '@vtt/system-dnd5e';
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
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      x: 150,
      y: 150,
      stats: {
        class: 'wizard',
        level: 5,
        abilities: { int: 18 },
        spells: ['knock', 'arcane-lock'],
      },
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

const door = () => store.chunks.get('0_0')!.walls.find((w) => w.id === 'door')!;

describe('knock and arcane lock', () => {
  it('lock the door pointed at, then open it', () => {
    const ana = join_('ana');
    ana.receive({ t: 'cast', caster: 'hero', spell: 'arcane-lock', slot: 2, targets: [], point: [300, 150] });
    expect(ana.take('error').map((e) => e.message)).toEqual([]);
    expect(door().door).toBe('locked');
    ana.receive({ t: 'cast', caster: 'hero', spell: 'knock', slot: 2, targets: [], point: [300, 150] });
    expect(ana.take('error')).toEqual([]);
    expect(door().door).toBe('open');
  });

  it('need a door near the point', () => {
    const ana = join_('ana');
    ana.receive({ t: 'cast', caster: 'hero', spell: 'knock', slot: 2, targets: [], point: [150, 250] });
    expect(ana.take('error')[0]?.message).toMatch(/no door/i);
  });
});

describe('guidance', () => {
  it('2014: is used up by the check it adds its d4 to', () => {
    const ana = join_('ana');
    store.setToken({
      ...store.tokens.get('hero')!,
      effects: [{ id: 'guidance-x', name: 'Guidance', checkBonus: '1d4', once: true, source: 'x' }],
    });
    ana.receive({ t: 'rollCheck', token: 'hero', ability: 'str' });
    expect(store.tokens.get('hero')!.effects).toBeUndefined();
  });
});
