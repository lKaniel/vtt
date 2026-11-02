// Spell pieces the server applies: options picked on casting, killing by hit
// points, damage and healing each turn, death ward, damage dealt back, and
// spells that only conjure a weapon.
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
  // Ana's 17th-level wizard, a goblin in front of them.
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      x: 150,
      y: 150,
      darkvision: 60,
      stats: {
        class: 'wizard',
        level: 17,
        maxHp: 80,
        abilities: { int: 20, dex: 10 },
        spells: ['protection-from-energy', 'power-word-kill', 'flame-blade', 'fire-shield'],
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

/** A fight with `first` going first. */
function fight(first: 'hero' | 'goblin'): { ana: FakeSocket; gm: FakeSocket } {
  const ana = join_('ana');
  const gm = join_('gm');
  dice = first === 'hero' ? [d20(20), d20(2)] : [d20(2), d20(20)];
  gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
  return { ana, gm };
}

describe('spell options', () => {
  it('protection from energy resists the type picked', () => {
    join_('ana').receive({
      t: 'cast',
      caster: 'hero',
      spell: 'protection-from-energy',
      slot: 3,
      targets: ['hero'],
      choice: 'fire',
    });
    expect(game.table.sheetOf(tok('hero'))!.resistances).toContain('fire');
  });

  it('refuses an option the spell doesn’t have', () => {
    const ana = join_('ana');
    ana.receive({
      t: 'cast',
      caster: 'hero',
      spell: 'protection-from-energy',
      slot: 3,
      targets: ['hero'],
      choice: 'psychic',
    });
    expect(ana.take('error')[0]!.message).toMatch(/no option called psychic/);
  });
});

describe('killing by hit points', () => {
  it('power word kill slays a creature with 100 hit points or fewer', () => {
    const ana = join_('ana');
    ana.receive({ t: 'cast', caster: 'hero', spell: 'power-word-kill', slot: 9, targets: ['goblin'] });
    expect(game.table.sheetOf(tok('goblin'))!.hp).toBe(0);
  });
});

describe('at the start of a turn', () => {
  it('lasting damage hurts the bearer and regeneration heals it', () => {
    store.setToken({
      ...tok('goblin'),
      hp: 5,
      effects: [{ id: 'burn', name: 'Burning', turnDamage: [{ dice: '1d6', type: 'fire' }] }],
    });
    store.setToken({ ...tok('hero'), hp: 10, effects: [{ id: 'regen', name: 'Regenerating', turnHeal: 1 }] });
    fight('goblin');
    // 1d6 rolls 4 at the default 0.5.
    expect(tok('goblin').hp).toBe(1);
    const gm = join_('gm');
    gm.receive({ t: 'endTurn' });
    expect(tok('hero').hp).toBe(11);
  });
});

describe('death ward', () => {
  it('leaves the warded creature at 1 hit point once, then ends', () => {
    store.setToken({ ...tok('hero'), hp: 5, effects: [{ id: 'ward', name: 'Death Ward', deathWard: true }] });
    game.table.hurt(tok('hero'), { hp: -3 }, 8);
    expect(tok('hero').hp).toBe(1);
    expect(tok('hero').effects ?? []).toEqual([]);
  });
});

describe('damage dealt back', () => {
  it('fire shield burns a creature that hits the bearer in melee', () => {
    const { ana, gm } = fight('hero');
    ana.receive({ t: 'cast', caster: 'hero', spell: 'fire-shield', slot: 4, targets: [], choice: 'warm' });
    ana.receive({ t: 'endTurn' });
    const before = game.table.sheetOf(tok('goblin'))!.hp;
    dice = [d20(19)];
    gm.receive({ t: 'attack', attacker: 'goblin', target: 'hero', attack: 'Scimitar' });
    expect(game.table.sheetOf(tok('goblin'))!.hp).toBeLessThan(before);
  });
});

describe('conjured weapons', () => {
  it('flame blade attacks nothing when cast, then attacks with the action', () => {
    const { ana } = fight('hero');
    ana.receive({ t: 'cast', caster: 'hero', spell: 'flame-blade', slot: 2, targets: [] });
    expect(ana.take('error')).toEqual([]);
    expect(tok('goblin').hp).toBeUndefined();
    dice = [d20(19)];
    ana.receive({ t: 'cast', caster: 'hero', spell: 'flame-blade', slot: 2, targets: ['goblin'], repeat: true });
    expect(game.table.sheetOf(tok('goblin'))!.hp).toBeLessThan(7);
  });
});
