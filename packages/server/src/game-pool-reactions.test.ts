import { type Token, TokenSchema } from '@vtt/system-dnd5e';
import { poolCaster } from '@vtt/system-dnd5e/fixtures/pool-class';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';

// Pool reactions at the table: an illusionist veils herself as an attack is
// about to hit (Misdirection), lands a veiled miss on someone beside her
// (Redirect), turns a hit that still lands into an illusion (Unreal Self),
// and steps out of a spell's way (Phantom Step).

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
    TokenSchema.parse(
      poolCaster(18, { x: 50, y: 50, darkvision: 60, ownership: { default: 'limited', ana: 'owner' } }),
    ),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), x: 150, y: 50, monster: 'goblin' }));
  store.setToken(TokenSchema.parse({ id: 'goblin2', name: 'Goblin 2', x: 50, y: 150, monster: 'goblin' }));
  store.setToken({ ...store.tokens.get('hero')!, x: 250, y: 250 });
  const nyx = store.tokens.get('nyx')!;
  store.setToken({ ...nyx, stats: { ...nyx.stats!, maxHp: 100 } });
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

/** The goblin's turn: it swings at Nyx (AC 12) and rolls `d20` (+4 to hit), then 3 on its d6 (+2). */
function goblinSwings(d20 = 15) {
  const ana = join_('ana');
  const gm = join_('gm');
  dice = [face(20), face(1)];
  gm.receive({ t: 'combatStart', tokens: ['goblin', 'nyx'] });
  dice = [face(d20), face(3, 6)];
  gm.receive({ t: 'attack', attacker: 'goblin', target: 'nyx', attack: 'Scimitar' });
  const [offer] = ana.take('reactionOffer');
  return { ana, gm, offer: offer!.offer };
}

describe('veiling against an attack', () => {
  it('offers Misdirection, Redirect and Unreal Self with their Lucidity costs', () => {
    const { offer } = goblinSwings();
    expect(offer.choices).toEqual(['misdirection', 'redirect', 'unreal-self']);
    // a goblin weighs 0.5: Misdirection 2 × 0.5, Redirect 0.5 more, Unreal Self 1.5 more
    expect(offer.labels).toEqual({
      misdirection: 'Misdirection (1 Lucidity)',
      redirect: 'Redirect (1 + 0.5 Lucidity)',
      'unreal-self': 'Unreal Self (1 + 1.5 Lucidity)',
    });
  });

  it('rolls the attack again and keeps the lower roll: a miss does nothing', () => {
    const { ana, offer } = goblinSwings();
    dice = [face(3)];
    ana.receive({ t: 'react', offer: offer.id, choice: 'misdirection' });
    expect(ana.take('error')).toEqual([]);
    expect(tok('nyx').hp).toBeUndefined();
    expect(tok('nyx').spent?.pool).toBe(1);
    expect(store.combat!.reacted).toEqual(['nyx']);
  });

  it('lets the hit through when the second roll still hits', () => {
    const { ana, offer } = goblinSwings();
    dice = [face(12)];
    ana.receive({ t: 'react', offer: offer.id, choice: 'misdirection' });
    expect(tok('nyx').hp).toBe(100 - 5);
    expect(tok('nyx').spent?.pool).toBe(1);
  });

  it('lands a veiled miss on another creature within 5 ft (Redirect)', () => {
    const { ana, offer } = goblinSwings();
    dice = [face(3)];
    ana.receive({ t: 'react', offer: offer.id, choice: 'redirect' });
    expect(tok('nyx').hp).toBeUndefined();
    expect(tok('goblin2').hp).toBe(7 - 5);
    expect(tok('nyx').spent?.pool).toBe(1.5);
  });

  it('only pays for the veil when a redirect finds no miss to land', () => {
    const { ana, offer } = goblinSwings();
    dice = [face(12)];
    ana.receive({ t: 'react', offer: offer.id, choice: 'redirect' });
    expect(tok('goblin2').hp).toBeUndefined();
    expect(tok('nyx').spent?.pool).toBe(1);
  });

  it('turns a hit that lands despite the veil into an illusion, and the attacker loses track (Unreal Self)', () => {
    const { ana, offer } = goblinSwings();
    dice = [face(12)];
    ana.receive({ t: 'react', offer: offer.id, choice: 'unreal-self' });
    expect(tok('nyx').hp).toBeUndefined();
    expect(tok('nyx').spent?.pool).toBe(2.5);
    expect(tok('goblin').effects).toMatchObject([
      { name: 'Lost track', onlyFor: 'nyx', disadvantage: true, advantageAgainst: true, source: 'nyx' },
    ]);
  });

  it('is not offered against an attacker with truesight', () => {
    const ana = join_('ana');
    const gm = join_('gm');
    store.setToken({ ...tok('goblin'), truesight: 60 });
    dice = [face(20), face(1)];
    gm.receive({ t: 'combatStart', tokens: ['goblin', 'nyx'] });
    dice = [face(15), face(3, 6)];
    gm.receive({ t: 'attack', attacker: 'goblin', target: 'nyx', attack: 'Scimitar' });
    expect(ana.take('reactionOffer')).toEqual([]);
  });
});

describe('using a reaction by hand', () => {
  it('is refused: it is offered when it can be taken', () => {
    const ana = join_('ana');
    ana.receive({ t: 'feature', token: 'nyx', feature: 'misdirection', targets: ['goblin'] });
    expect(ana.take('error').map((m) => m.message)).toEqual([
      "Misdirection is a reaction: it's offered when it can be used",
    ]);
  });
});

describe('stepping out of a spell’s way (Phantom Step)', () => {
  function fireball(save: number) {
    store.setToken({
      ...tok('hero'),
      x: 250,
      y: 250,
      darkvision: 60,
      stats: { class: 'wizard', level: 5, maxHp: 30, abilities: { int: 18 }, spells: ['fireball'] },
    });
    const gm = join_('gm');
    // 8d6 of 3s = 24; everyone saves with `save`
    dice = [...Array<number>(8).fill(face(3, 6)), face(save), face(save), face(save)];
    gm.receive({ t: 'cast', caster: 'hero', spell: 'fireball', slot: 3, targets: [], point: [100, 100] });
    return gm;
  }

  it('takes half on a failed Dexterity save, paying twice the caster’s weight', () => {
    fireball(2);
    expect(tok('nyx').hp).toBe(100 - 12);
    expect(tok('nyx').spent?.pool).toBeGreaterThan(0);
  });

  it('takes nothing on a successful one', () => {
    fireball(19);
    expect(tok('nyx').hp).toBeUndefined();
    expect(tok('nyx').spent?.pool).toBeGreaterThan(0);
  });
});
