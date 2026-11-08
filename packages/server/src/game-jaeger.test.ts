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
  const subclasses = ['absolute', 'heretic', 'marauder', 'salvation', 'sanguine'].map((c) => ({
    id: `${c}-chapter`,
    name: c,
  }));
  const doc = { id: 'jaeger', type: 'homebrew', rev: 0, kind: 'class', name: 'Jaeger', subclasses } as unknown as Doc;
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

/** Ana's jaeger joins a Chapter at `level`; `data` sets more token fields. */
function chapter(name: string, level: number, data: Partial<Token> = {}): void {
  const hero = tok('hero');
  const { class: _class, level: _level, ...stats } = hero.stats!;
  const classes = [{ class: 'jaeger', level, subclass: `${name}-chapter` }];
  store.setToken({ ...hero, stats: { ...stats, classes }, ...data });
}

describe("a jaeger's Chapter in a fight", () => {
  it('absolute: a counter strike parries the whole hit and cuts the goblin with the rest', () => {
    chapter('absolute', 6);
    const { ana, gm } = fight(true);
    dice = [face(15), face(5, 6)];
    gm.receive({ t: 'attack', attacker: 'goblin', target: 'hero', attack: 'Scimitar' });
    const [offer] = ana.take('reactionOffer');
    // 12 + 4 hits the goblin's AC 15; 8 + 1 + 3 blocks the 7 and cuts back 5.
    dice = [face(12), face(8, 8)];
    ana.receive({ t: 'react', offer: offer!.offer.id, choice: 'weapon-parry' });
    expect(tok('hero').hp).toBeUndefined();
    expect(tok('goblin').hp).toBe(7 - 5);
    expect(tok('hero').effects).toMatchObject([{ name: 'Counter Strike', advantage: true }]);
  });

  it('sanguine: crimson rage gives a point and a die as the hit leaves it bloodied', () => {
    chapter('sanguine', 3, { hp: 16 });
    const { ana, gm } = fight(true);
    store.setToken({ ...tok('hero'), spent: { uses: { focus: 2 } } });
    dice = [face(15), face(5, 6)];
    gm.receive({ t: 'attack', attacker: 'goblin', target: 'hero', attack: 'Scimitar' });
    expect(ana.take('reactionOffer')).toEqual([]);
    expect(tok('hero').hp).toBe(16 - 7);
    expect(tok('hero').spent?.uses).toEqual({ focus: 1 });
    expect(tok('hero').momentum).toEqual({ dice: 1, fresh: true });
  });

  it("salvation: savior's focus gives a point back as an ally drops", () => {
    chapter('salvation', 3);
    const friend = { ...tok('hero'), id: 'friend', name: 'Bo', x: 250, actor: undefined, linked: false, hp: 1 };
    store.setToken(TokenSchema.parse({ ...friend, stats: { maxHp: 5 }, ownership: { default: 'owner' } }));
    const { gm } = fight(true);
    store.setToken({ ...tok('hero'), spent: { uses: { focus: 2 } } });
    dice = [face(15), face(5, 6)];
    gm.receive({ t: 'attack', attacker: 'goblin', target: 'friend', attack: 'Scimitar' });
    expect(gm.take('error')).toEqual([]);
    expect(tok('friend').hp).toBe(0);
    expect(tok('hero').spent?.uses).toEqual({ focus: 1 });
  });

  it('marauder: great cleave adds a die and an attack for each die spent', () => {
    chapter('marauder', 4, { momentum: { dice: 2 }, inventory: [{ item: 'greatsword', equipped: true, qty: 1 }] });
    const { ana } = fight(false);
    dice = [face(15), face(1, 6), face(1, 6), face(2, 8)];
    ana.receive({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Greatsword', finisher: 'path-of-gore' });
    expect(ana.take('error')).toEqual([]);
    expect(tok('goblin').hp).toBe(7 - (1 + 1 + 1 + 2));
    // The one attack of the action is spent; the cleave gives two more.
    expect(store.combat?.left.attacks).toBe(2);
    expect(tok('hero').momentum).toBeUndefined();
  });
});

describe("a jaeger's Chapter arts and finishers", () => {
  it('salvation: prayer of salvation heals and gives as many temporary hit points', () => {
    chapter('salvation', 3, { hp: 20 });
    const ana = join_('ana');
    dice = [face(4, 6)];
    ana.receive({ t: 'feature', token: 'hero', feature: 'art-of-salvation', targets: ['hero'] });
    expect(ana.take('error')).toEqual([]);
    expect(tok('hero')).toMatchObject({ hp: 24, tempHp: 4, spent: { uses: { focus: 1 } } });
  });

  it('sanguine: blood drain drinks from a bleeding goblin and gives a point back', () => {
    const bleed = { id: 'hemorrhaging-wound-hero', name: 'Bleeding', bleed: { dice: 1, die: 6, dc: 30 } };
    store.setToken({ ...tok('goblin'), effects: [bleed] });
    chapter('sanguine', 4, { hp: 20, momentum: { dice: 2 }, spent: { uses: { focus: 1 } } });
    const ana = join_('ana');
    // The 2d6 of the dice first, then the goblin's Constitution save.
    dice = [face(3, 6), face(3, 6), face(1)];
    ana.receive({ t: 'feature', token: 'hero', feature: 'vital-consumption', targets: ['goblin'] });
    expect(ana.take('error')).toEqual([]);
    expect(tok('goblin').hp).toBe(7 - 6);
    expect(tok('hero')).toMatchObject({ hp: 23, spent: { uses: { focus: 0 } } });
    expect(tok('hero').momentum).toBeUndefined();
  });

  it('heretic: a spell cast from a 3rd-level pact slot gives three momentum dice', () => {
    chapter('heretic', 14);
    store.setToken({ ...tok('hero'), stats: { ...tok('hero').stats!, spells: ['invisibility'] } });
    const ana = join_('ana');
    ana.receive({ t: 'cast', caster: 'hero', spell: 'invisibility', slot: 3, targets: ['hero'] });
    expect(ana.take('error').map((e) => e.message)).toEqual([]);
    expect(tok('hero').spent?.slots).toEqual([0, 0, 1]);
    expect(tok('hero').momentum).toEqual({ dice: 3, fresh: true });
  });
});
