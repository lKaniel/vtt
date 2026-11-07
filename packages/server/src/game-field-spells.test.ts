// Spells whose area changes what happens inside it (silence, aura of life)
// and antilife shell's barrier, played through the game.
import { type Effect, TokenSchema } from '@vtt/system-dnd5e';
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
        class: 'cleric',
        level: 9,
        abilities: { wis: 18 },
        spells: ['silence', 'sacred-flame', 'antilife-shell'],
      },
    }),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), x: 250, y: 150, monster: 'goblin' }));
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

describe('silence', () => {
  it('cast on the caster’s own square, stops their spoken spells', () => {
    const ana = join_('ana');
    ana.receive({ t: 'cast', caster: 'hero', spell: 'silence', slot: 2, targets: [], point: [150, 150] });
    expect(ana.take('error')).toEqual([]);
    expect(tok('hero').effects?.some((e) => e.silenced && e.auraFrom)).toBe(true);
    expect(tok('goblin').effects?.some((e) => e.silenced)).toBe(true);
    ana.receive({ t: 'cast', caster: 'hero', spell: 'sacred-flame', slot: 0, targets: ['goblin'] });
    expect(ana.take('error')[0]?.message).toMatch(/Silence/);
  });
});

describe('antilife shell', () => {
  it('stops a living creature walking up to the caster', () => {
    const ana = join_('ana');
    const gm = join_('gm');
    store.setToken({ ...tok('hero'), x: 50 });
    store.setToken({ ...tok('goblin'), x: 550 });
    const chunk = store.chunks.get('0_0')!;
    store.setChunk('0_0', { ...chunk, walls: chunk.walls.map((w) => (w.id === 'door' ? { ...w, door: 'open' } : w)) });
    ana.receive({ t: 'cast', caster: 'hero', spell: 'antilife-shell', slot: 5, targets: [] });
    expect(ana.take('error')).toEqual([]);
    gm.receive({ t: 'move', token: 'goblin', to: [250, 150] });
    expect(gm.take('error')[0]?.message).toMatch(/Antilife Shell/);
    expect(tok('goblin').x).toBe(550);
  });
});

describe('aura of life', () => {
  it('a creature at 0 hit points in it regains 1 as its turn starts', () => {
    const gm = join_('gm');
    const life: Effect = { id: 'life', name: 'Aura of Life', lifeline: true, source: 'goblin' };
    store.setToken({ ...tok('goblin'), hp: 0, effects: [life] });
    gm.receive({ t: 'combatStart', tokens: ['goblin'] });
    expect(tok('goblin').hp).toBe(1);
  });
});
