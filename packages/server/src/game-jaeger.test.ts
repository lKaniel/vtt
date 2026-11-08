// A jaeger (a class from a pack or homebrew, automated by id) in a fight:
// focus arts against hits, finishers riding on its own hits, momentum dice
// fading at the end of its turn, focus back on initiative.
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

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  const gm = join_('gm');
  const doc = { id: 'jaeger', type: 'homebrew', rev: 0, kind: 'class', name: 'Jaeger' } as unknown as Doc;
  gm.receive({ t: 'ops', txn: 't', ops: [{ op: 'create', coll: 'homebrew', doc }] });
  expect(gm.take('reject')).toEqual([]);
  // Ana's 4th-level jaeger (AC 13, Str 12, Dex 16) with a longsword; a goblin next to her.
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      x: 50,
      y: 50,
      darkvision: 60,
      stats: {
        class: 'jaeger',
        level: 4,
        maxHp: 30,
        abilities: { str: 12, dex: 16, con: 14 },
        features: ['jaeger/breaking-blow'],
      },
      inventory: [{ item: 'longsword', equipped: true, qty: 1 }],
    }),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), x: 150, y: 50, monster: 'goblin' }));
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

/** A fight with the goblin first (`goblinFirst`) or the jaeger first. */
function fight(goblinFirst: boolean): { ana: FakeSocket; gm: FakeSocket } {
  const ana = join_('ana');
  const gm = join_('gm');
  dice = goblinFirst ? [face(20), face(1)] : [face(1), face(20)];
  gm.receive({ t: 'combatStart', tokens: ['goblin', 'hero'] });
  return { ana, gm };
}

describe('a jaeger in a fight', () => {
  it('parries a hit for a focus point, which gives a momentum die', () => {
    const { ana, gm } = fight(true);
    dice = [face(15), face(5, 6)];
    gm.receive({ t: 'attack', attacker: 'goblin', target: 'hero', attack: 'Scimitar' });
    const [offer] = ana.take('reactionOffer');
    expect(offer!.offer.choices).toEqual(['weapon-parry', 'dodge-step']);
    // The parry: 12 on the d20, 3 on the longsword's d8 (+1): 4 of the 7 blocked.
    dice = [face(12), face(3, 8)];
    ana.receive({ t: 'react', offer: offer!.offer.id, choice: 'weapon-parry' });
    expect(tok('hero').hp).toBe(30 - 3);
    expect(tok('hero').spent?.uses).toEqual({ focus: 1 });
    expect(tok('hero').momentum).toEqual({ dice: 1, fresh: true });
  });

  it('spends its momentum dice on a breaking blow that knocks the goblin down', () => {
    const { ana } = fight(false);
    store.setToken({ ...tok('hero'), momentum: { dice: 1 } });
    // 15 to hit, 4 on the d8, then the goblin's Strength save fails with a 2.
    dice = [face(15), face(4, 8), face(2)];
    ana.receive({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Longsword', finisher: 'breaking-blow' });
    expect(ana.take('error')).toEqual([]);
    expect(tok('goblin').effects).toMatchObject([{ name: 'Breaking Blow', conditions: ['prone'] }]);
    expect(tok('hero').momentum).toBeUndefined();
  });

  it('refuses a finisher with no dice to spend', () => {
    const { ana } = fight(false);
    ana.receive({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Longsword', finisher: 'brutal-finisher' });
    expect(ana.take('error').map((e) => e.message)).toEqual([expect.stringMatching(/no momentum dice/)]);
  });

  it('keeps its dice through a turn next to a foe, and loses them away from one', () => {
    const { ana } = fight(false);
    store.setToken({ ...tok('hero'), momentum: { dice: 2 } });
    ana.receive({ t: 'endTurn' });
    expect(tok('hero').momentum).toEqual({ dice: 2 });
    store.setToken({ ...tok('goblin'), x: 950 });
    const gm = join_('gm');
    gm.receive({ t: 'endTurn' });
    ana.receive({ t: 'endTurn' });
    expect(tok('hero').momentum).toBeUndefined();
  });

  it('gets a focus point back when initiative is rolled with none left', () => {
    store.setToken({ ...tok('hero'), spent: { uses: { focus: 2 } } });
    fight(false);
    expect(tok('hero').spent?.uses).toEqual({ focus: 1 });
  });

  it('bleeds a wounded goblin at the end of its turn, a die fewer each time', () => {
    const { gm } = fight(true);
    const bleed = { dice: 2, die: 6, dc: 30 };
    store.setToken({ ...tok('goblin'), effects: [{ id: 'hemorrhaging-wound-hero', name: 'Bleeding', bleed }] });
    // 1 and 2 on the dice, then a failed save.
    dice = [face(1, 6), face(2, 6), face(1)];
    gm.receive({ t: 'endTurn' });
    expect(tok('goblin').hp).toBe(7 - 3);
    expect(tok('goblin').effects?.[0]?.bleed).toEqual({ dice: 1, die: 6, dc: 30 });
  });
});
