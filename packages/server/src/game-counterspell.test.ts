// Counterspell: a spell cast in a fight waits while an enemy caster within
// 60 ft decides whether to counter it.
import { type Token, TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';

let store: GameStore;
let game: Game;
let dice: number[];
const face = (n: number, sides = 20) => (n - 1) / sides + 0.001;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      x: 50,
      y: 50,
      darkvision: 60,
      stats: { class: 'wizard', level: 5, abilities: { int: 16 }, spells: ['magic-missile', 'counterspell'] },
    }),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), x: 150, y: 50, monster: 'goblin' }));
  store.setToken(
    TokenSchema.parse({
      id: 'foe',
      name: 'Foe',
      x: 250,
      y: 50,
      ownership: { default: 'none' },
      stats: { class: 'wizard', level: 5, abilities: { int: 16 }, spells: ['counterspell'] },
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

const tok = (id: string): Token => store.tokens.get(id)!;

/** Ana's wizard goes first and casts magic missile at the goblin. */
function heroCasts(): { ana: FakeSocket; gm: FakeSocket } {
  const ana = join_('ana');
  const gm = join_('gm');
  dice = [face(20), face(1), face(1)];
  gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin', 'foe'] });
  ana.receive({ t: 'cast', caster: 'hero', spell: 'magic-missile', slot: 1, targets: ['goblin'] });
  return { ana, gm };
}

describe('counterspell', () => {
  it('stops the spell when the enemy takes it, and both spend their slots', () => {
    const { ana, gm } = heroCasts();
    expect(ana.take('error')).toEqual([]);
    const [offer] = gm.take('reactionOffer');
    expect(offer!.offer).toMatchObject({ reactor: 'foe', target: 'hero', kind: 'spell', choices: ['counterspell'] });
    expect(tok('goblin').hp).toBeUndefined();
    gm.receive({ t: 'react', offer: offer!.offer.id, choice: 'counterspell' });
    expect(gm.take('error')).toEqual([]);
    expect(tok('goblin').hp).toBeUndefined();
    expect(tok('hero').spent?.slots).toEqual([1]);
    expect(tok('foe').spent?.slots).toEqual([0, 0, 1]);
    expect(store.combat!.reacted).toContain('foe');
  });

  it('lets the spell through when the enemy declines', () => {
    const { gm } = heroCasts();
    const [offer] = gm.take('reactionOffer');
    gm.receive({ t: 'react', offer: offer!.offer.id });
    expect(tok('goblin').hp).toBeLessThan(7);
  });

  it('cannot be cast from the spell bar', () => {
    const ana = join_('ana');
    ana.receive({ t: 'cast', caster: 'hero', spell: 'counterspell', slot: 3, targets: ['foe'] });
    expect(ana.take('error')[0]?.message).toMatch(/reaction/);
  });
});
