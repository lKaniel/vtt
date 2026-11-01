// Buff and restoration spells applied by the server: aid, heroism, lesser restoration, revivify.
import { type Token, TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './game-store.ts';

let store: GameStore;
let game: Game;
let dice: number[];

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  // Ana's 5th-level cleric next to Bo's fighter.
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      x: 50,
      y: 50,
      stats: {
        class: 'cleric',
        level: 5,
        maxHp: 30,
        abilities: { wis: 16 },
        spells: ['aid', 'heroism', 'lesser-restoration', 'revivify'],
      },
    }),
  );
  store.setToken(
    TokenSchema.parse({
      id: 'bo',
      name: 'Fighter',
      x: 50,
      y: 150,
      ownership: { default: 'limited', bo: 'owner' },
      stats: { class: 'fighter', level: 5, maxHp: 40, abilities: { str: 16 } },
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
const sheet = (id: string) => game.table.sheetOf(tok(id))!;
const cast = (spell: string, slot: number) =>
  join_('ana').receive({ t: 'cast', caster: 'hero', spell, slot, targets: ['bo'] });

describe('buff spells on the server', () => {
  it('aid raises the maximum and heals by as much', () => {
    store.setToken({ ...tok('bo'), hp: 39 });
    cast('aid', 2);
    expect(sheet('bo')).toMatchObject({ maxHp: 45, hp: 44 });
  });

  it('heroism gives temporary hit points at the start of each of the target’s turns', () => {
    cast('heroism', 1);
    const gm = join_('gm');
    dice = [0.99, 0.5];
    gm.receive({ t: 'combatStart', tokens: ['bo', 'hero'] });
    expect(tok('bo').tempHp).toBe(3);
  });

  it('lesser restoration ends blindness', () => {
    store.setToken({ ...tok('bo'), effects: [{ id: 'ray', name: 'Blindness', conditions: ['blinded'] }] });
    cast('lesser-restoration', 2);
    expect(tok('bo').effects ?? []).toEqual([]);
  });

  it('revivify brings a dead fighter back with 1 hp', () => {
    store.setToken({ ...tok('bo'), hp: 0, deathSaves: { successes: 0, failures: 3, dead: true } });
    cast('revivify', 3);
    expect(tok('bo')).toMatchObject({ hp: 1 });
    expect(tok('bo').deathSaves).toBeUndefined();
  });
});

describe('haste on the server', () => {
  it('gives the hasted creature an extra attack at the start of its turn', () => {
    store.setToken({ ...tok('bo'), effects: [{ id: 'haste-hero', name: 'Haste', turnAttacks: 1, source: 'hero' }] });
    const gm = join_('gm');
    dice = [0.99, 0.5];
    gm.receive({ t: 'combatStart', tokens: ['bo', 'hero'] });
    expect(store.combat!.left).toMatchObject({ action: true, attacks: 1 });
  });
});
