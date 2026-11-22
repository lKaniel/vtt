// A monk of a subclass the game brings as a homebrew document (Way of the
// Astral Self, automated by id): the arms burst on foes when summoned and
// strike with Wisdom for force damage, and the body adds a die to the first
// hit each turn.
import type { Doc } from '@vtt/core';
import { type Token, TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';

let store: GameStore;
let game: Game;
let dice: number[];
const face = (n: number, sides = 20) => (n - 1) / sides + 0.001;

const SUBCLASS = {
  id: 'way-of-the-astral-self',
  type: 'homebrew',
  rev: 0,
  kind: 'subclass',
  class: 'monk',
  name: 'Way of the Astral Self',
  ownership: { default: 'observer' },
  features: [
    { id: 'arms-of-the-astral-self', name: 'Arms of the Astral Self', level: 3 },
    { id: 'visage-of-the-astral-self', name: 'Visage of the Astral Self', level: 6 },
    { id: 'body-of-the-astral-self', name: 'Body of the Astral Self', level: 11 },
  ],
} as unknown as Doc;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  const gm = join_('gm');
  gm.receive({ t: 'ops', txn: 't', ops: [{ op: 'create', coll: 'homebrew', doc: SUBCLASS }] });
  expect(gm.take('reject')).toEqual([]);
  // Ana's 11th-level monk (Wis 18, Dex 16), a goblin 5 ft east and Bo's fighter 5 ft west.
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      stats: {
        classes: [{ class: 'monk', level: 11, subclass: 'way-of-the-astral-self' }],
        maxHp: 60,
        abilities: { str: 10, dex: 16, con: 14, wis: 18 },
      },
    }),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), x: 250, y: 150, monster: 'goblin' }));
  store.setToken(
    TokenSchema.parse({ id: 'friend', name: 'Friend', x: 50, y: 150, ownership: { bo: 'owner' }, monster: 'veteran' }),
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

/** A fight with the monk's turn first. */
function fight(ana = join_('ana')): FakeSocket {
  const gm = join_('gm');
  dice = [face(20), face(1), face(1)];
  gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin', 'friend'] });
  return ana;
}

describe('a way of the astral self monk', () => {
  beforeEach(() => store.setToken(TokenSchema.parse({ ...tok('goblin'), monster: 'ogre' })));

  it('summons the arms for a ki point: foes around save or take force damage, allies are spared', () => {
    const ana = fight();
    // 3 and 5 on the two d8s, then the ogre fails its Dexterity save (2).
    dice = [face(3, 8), face(5, 8), face(2)];
    ana.receive({ t: 'feature', token: 'hero', feature: 'arms-of-the-astral-self', point: [250, 150] });
    expect(ana.take('error')).toEqual([]);
    expect(tok('goblin').hp).toBe(59 - 8);
    expect(tok('friend').hp).toBeUndefined();
    expect(tok('hero').spent?.uses).toEqual({ ki: 1 });
    expect(tok('hero').effects).toMatchObject([{ name: 'Arms of the Astral Self', rounds: 100 }]);
  });

  it('adds a martial arts die to the first hit with the arms each turn once the body is out', () => {
    const ana = join_('ana');
    // Out of a fight: the arms (the ogre saves on a 20) and the visage.
    dice = [face(1, 8), face(1, 8), face(20)];
    ana.receive({ t: 'feature', token: 'hero', feature: 'arms-of-the-astral-self', point: [250, 150] });
    ana.receive({ t: 'feature', token: 'hero', feature: 'visage-of-the-astral-self' });
    fight(ana);
    ana.receive({ t: 'feature', token: 'hero', feature: 'body-of-the-astral-self' });
    expect(ana.take('error')).toEqual([]);
    // Two hits: 15 to hit, 4 on the d8 and 6 on the extra d8; then 15 and 4 again, no extra die.
    dice = [face(15), face(4, 8), face(6, 8)];
    ana.receive({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Astral Arms' });
    dice = [face(15), face(4, 8), face(6, 8)];
    ana.receive({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Astral Arms' });
    expect(ana.take('error')).toEqual([]);
    // (4 + 4 Wisdom) + 6 force, then 4 + 4.
    expect(tok('goblin').hp).toBe(59 - 14 - 8);
  });
});
