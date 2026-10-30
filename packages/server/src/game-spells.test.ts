import { TokenSchema, type Token } from '@vtt/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { WorldStore } from './world-store.ts';

let store: WorldStore;
let game: Game;
/** What the next random numbers will be; 0.5 once they run out. */
let dice: number[];

/** The rng value that rolls `n` on a die with `sides` sides. */
const face = (n: number, sides = 20) => (n - 1) / sides + 0.001;

function put(data: object): void {
  store.setToken(TokenSchema.parse(data));
}

beforeEach(async () => {
  store = new WorldStore(await makeWorld());
  await store.load();
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  // A 5th-level wizard (Ana's) and a 5th-level fighter (Bo's) in the room, goblins in the corners.
  put({
    ...store.tokens.get('hero'),
    id: 'hero',
    name: 'Wiz',
    x: 50,
    y: 50,
    darkvision: 60,
    stats: {
      class: 'wizard',
      level: 5,
      maxHp: 30,
      abilities: { int: 18, dex: 14, con: 14 },
      spells: [
        'fire-bolt',
        'magic-missile',
        'fireball',
        'hold-person',
        'misty-step',
        'find-familiar',
        'conjure-animals',
      ],
    },
  });
  put({
    id: 'bo',
    name: 'Fighter',
    x: 50,
    y: 250,
    controllers: ['bo'],
    darkvision: 60,
    stats: { class: 'fighter', level: 5, maxHp: 40, abilities: { str: 16 } },
    inventory: [{ item: 'longsword', equipped: true }],
  });
  put({ ...store.tokens.get('goblin'), x: 250, y: 50, monster: 'goblin' });
  put({ id: 'goblin2', name: 'Goblin 2', x: 250, y: 250, monster: 'goblin' });
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

/** Starts a fight in the order given. */
function fight(order: string[]): { ana: FakeSocket; bo: FakeSocket; gm: FakeSocket } {
  const ana = join_('ana');
  const bo = join_('bo');
  const gm = join_('gm');
  dice = order.map((_, i) => face(20 - 5 * i));
  gm.receive({ t: 'combatStart', tokens: order });
  for (const ws of [ana, bo, gm]) ws.sent = [];
  return { ana, bo, gm };
}

const tok = (id: string): Token => store.tokens.get(id)!;
const spellLogs = (ws: FakeSocket) => ws.take('chat').flatMap((m) => (m.message.spell ? [m.message.spell] : []));
const errors = (ws: FakeSocket) => ws.take('error').map((m) => m.message);

describe('casting spells', () => {
  it('casts a cantrip: spell attack, damage, the action spent, logged in chat', () => {
    const { ana } = fight(['hero', 'goblin', 'goblin2', 'bo']);
    // d20 of 15 + 7 hits AC 15; 2d10 roll 1s.
    dice = [face(15), face(1, 10), face(1, 10)];
    ana.receive({ t: 'cast', caster: 'hero', spell: 'fire-bolt', slot: 0, targets: ['goblin'] });
    expect(tok('goblin').hp).toBe(5);
    const [log] = spellLogs(ana);
    expect(log).toMatchObject({
      caster: 'Wiz',
      spell: 'Fire Bolt',
      results: [{ target: 'Goblin', hit: true, damage: 2 }],
    });
    expect(store.combat!.left.action).toBe(false);
    ana.receive({ t: 'cast', caster: 'hero', spell: 'fire-bolt', slot: 0, targets: ['goblin'] });
    expect(errors(ana)[0]).toMatch(/already used/);
  });

  it('spends a spell slot and refuses when none are left', () => {
    const ana = join_('ana');
    dice = Array<number>(6).fill(face(1, 4));
    ana.receive({
      t: 'cast',
      caster: 'hero',
      spell: 'magic-missile',
      slot: 1,
      targets: ['goblin', 'goblin', 'goblin2'],
    });
    expect(tok('hero').spent?.slots).toEqual([1]);
    expect(tok('goblin').hp).toBe(3);
    store.setToken({ ...tok('hero'), spent: { slots: [4] } });
    ana.receive({ t: 'cast', caster: 'hero', spell: 'magic-missile', slot: 1, targets: ['goblin'] });
    expect(errors(ana)[0]).toMatch(/no 1st-level slots left/);
  });

  it('says a creature is down once, however many darts hit it', () => {
    const ana = join_('ana');
    dice = Array<number>(6).fill(face(4, 4));
    ana.receive({
      t: 'cast',
      caster: 'hero',
      spell: 'magic-missile',
      slot: 1,
      targets: ['goblin', 'goblin', 'goblin'],
    });
    expect(spellLogs(ana)[0]!.notes).toEqual(['Goblin is down']);
  });

  it('catches everyone in a fireball’s area, the caster too if they stand in it', () => {
    const ana = join_('ana');
    // 8d6 of 1s = 8; everyone fails their save.
    dice = [...Array<number>(8).fill(face(1, 6)), face(1), face(1), face(1), face(1)];
    ana.receive({ t: 'cast', caster: 'hero', spell: 'fireball', slot: 3, targets: [], point: [250, 150] });
    expect([tok('goblin').hp, tok('goblin2').hp, tok('hero').hp, tok('bo').hp]).toEqual([0, 0, 22, 32]);
  });

  it('refuses a target out of range or out of sight', () => {
    const ana = join_('ana');
    ana.receive({ t: 'cast', caster: 'hero', spell: 'fireball', slot: 3, targets: [], point: [5000, 150] });
    expect(errors(ana)[0]).toMatch(/out of range/);
    put({ id: 'outside', name: 'Outside', x: 550, y: 150, monster: 'goblin' });
    ana.receive({ t: 'cast', caster: 'hero', spell: 'fire-bolt', slot: 0, targets: ['outside'] });
    expect(errors(ana)[0]).toMatch(/No such target/);
  });

  it('only lets players cast with creatures they control', () => {
    const bo = join_('bo');
    bo.receive({ t: 'cast', caster: 'hero', spell: 'fire-bolt', slot: 0, targets: ['goblin'] });
    expect(errors(bo)[0]).toMatch(/don't control/);
  });

  it('teleports with misty step as a bonus action', () => {
    const { ana } = fight(['hero', 'goblin', 'goblin2', 'bo']);
    ana.receive({ t: 'cast', caster: 'hero', spell: 'misty-step', slot: 2, targets: [], point: [150, 250] });
    expect([tok('hero').x, tok('hero').y]).toEqual([150, 250]);
    expect(store.combat!.left).toMatchObject({ action: true, bonus: false });
  });
});

describe('concentration and lasting effects', () => {
  function holdGoblin(ana: FakeSocket) {
    dice = [face(1)];
    ana.receive({ t: 'cast', caster: 'hero', spell: 'hold-person', slot: 2, targets: ['goblin'] });
  }

  it('paralyzes with hold person and tracks the caster’s concentration', () => {
    const ana = join_('ana');
    holdGoblin(ana);
    expect(tok('goblin').effects?.[0]).toMatchObject({
      name: 'Hold Person',
      conditions: ['paralyzed'],
      source: 'hero',
    });
    expect(tok('hero').concentration).toEqual({ spell: 'hold-person', name: 'Hold Person' });
  });

  it('stops a paralyzed creature from acting', () => {
    const { ana, gm } = fight(['hero', 'goblin', 'goblin2', 'bo']);
    holdGoblin(ana);
    ana.receive({ t: 'endTurn' });
    gm.receive({ t: 'attack', attacker: 'goblin', target: 'hero', attack: 'Scimitar' });
    expect(errors(gm)[0]).toMatch(/can't act/);
  });

  it('lets the held creature save again at the end of its turn', () => {
    const { ana, gm } = fight(['hero', 'goblin', 'goblin2', 'bo']);
    holdGoblin(ana);
    ana.receive({ t: 'endTurn' });
    dice = [face(20)];
    gm.receive({ t: 'endTurn' });
    expect(tok('goblin').effects).toBeUndefined();
  });

  it('ends the spell when the caster drops concentration or starts another', () => {
    const ana = join_('ana');
    holdGoblin(ana);
    ana.receive({ t: 'dropConcentration', token: 'hero' });
    expect(tok('goblin').effects).toBeUndefined();
    expect(tok('hero').concentration).toBeUndefined();
  });

  it('makes the caster save to keep concentrating when hurt', () => {
    const { ana, gm } = fight(['hero', 'goblin2', 'bo', 'goblin']);
    holdGoblin(ana);
    ana.receive({ t: 'endTurn' });
    // Goblin 2 walks up and hits: d20 18 hits, 1d6+2 = 3. Con save d20 of 1 fails.
    store.setToken({ ...tok('goblin2'), x: 150, y: 50 });
    dice = [face(18), face(1, 6), face(1)];
    gm.receive({ t: 'attack', attacker: 'goblin2', target: 'hero', attack: 'Scimitar' });
    expect(tok('hero').concentration).toBeUndefined();
    expect(tok('goblin').effects).toBeUndefined();
  });

  it('counts effects down on the turns of the caster', () => {
    const { ana, gm, bo } = fight(['hero', 'goblin', 'goblin2', 'bo']);
    store.setToken({
      ...tok('goblin'),
      effects: [{ id: 'gb', name: 'Guiding Bolt', advantageAgainst: true, once: true, rounds: 1, source: 'hero' }],
    });
    ana.receive({ t: 'endTurn' });
    expect(tok('goblin').effects).toHaveLength(1);
    gm.receive({ t: 'endTurn' });
    gm.receive({ t: 'endTurn' });
    bo.receive({ t: 'endTurn' });
    expect(tok('goblin').effects).toBeUndefined();
  });
});

describe('summons', () => {
  it('brings a familiar that the caster’s player controls', () => {
    const ana = join_('ana');
    ana.receive({
      t: 'cast',
      caster: 'hero',
      spell: 'find-familiar',
      slot: 1,
      targets: [],
      point: [150, 50],
      summon: 'owl',
    });
    const owl = [...store.tokens.values()].find((t) => t.monster === 'owl')!;
    expect(owl).toMatchObject({ x: 150, y: 50, controllers: ['ana'], summon: { by: 'hero', spell: 'find-familiar' } });
  });

  it('refuses summoning spells that take minutes in the middle of a fight', () => {
    const { ana } = fight(['hero', 'goblin', 'goblin2', 'bo']);
    ana.receive({
      t: 'cast',
      caster: 'hero',
      spell: 'find-familiar',
      slot: 1,
      targets: [],
      point: [150, 50],
      summon: 'owl',
    });
    expect(errors(ana)[0]).toMatch(/too long to cast in a fight/);
  });

  it('puts conjured animals into the fight after the caster and removes them with concentration', () => {
    const { ana } = fight(['hero', 'goblin', 'goblin2', 'bo']);
    ana.receive({
      t: 'cast',
      caster: 'hero',
      spell: 'conjure-animals',
      slot: 3,
      targets: [],
      point: [150, 150],
      summon: 'dire-wolf',
    });
    const wolves = [...store.tokens.values()].filter((t) => t.monster === 'dire-wolf').map((t) => t.id);
    expect(wolves).toHaveLength(2);
    expect(store.combat!.order.map((e) => e.token).slice(0, 3)).toEqual(['hero', ...wolves]);
    ana.receive({ t: 'dropConcentration', token: 'hero' });
    expect(wolves.map((id) => store.tokens.has(id))).toEqual([false, false]);
    expect(store.combat!.order.map((e) => e.token)).toEqual(['hero', 'goblin', 'goblin2', 'bo']);
  });
});

describe('class features', () => {
  it('lets a fighter attack twice with one action at 5th level', () => {
    const { bo } = fight(['bo', 'hero', 'goblin', 'goblin2']);
    store.setToken({ ...tok('goblin2'), x: 150, y: 250 });
    dice = [face(2), face(2)];
    bo.receive({ t: 'attack', attacker: 'bo', target: 'goblin2', attack: 'Longsword' });
    expect(store.combat!.left).toMatchObject({ action: false, attacks: 1 });
    bo.receive({ t: 'attack', attacker: 'bo', target: 'goblin2', attack: 'Longsword' });
    expect(store.combat!.left.attacks).toBe(0);
    bo.receive({ t: 'attack', attacker: 'bo', target: 'goblin2', attack: 'Longsword' });
    expect(errors(bo)[0]).toMatch(/already used/);
  });

  it('uses second wind as a bonus action and action surge for another action', () => {
    const { bo } = fight(['bo', 'hero', 'goblin', 'goblin2']);
    store.setToken({ ...tok('bo'), hp: 10 });
    dice = [face(4, 10)];
    bo.receive({ t: 'feature', token: 'bo', feature: 'second-wind' });
    expect(tok('bo').hp).toBe(19);
    expect(store.combat!.left.bonus).toBe(false);
    store.setCombat({ ...store.combat!, left: { ...store.combat!.left, action: false } });
    bo.receive({ t: 'feature', token: 'bo', feature: 'action-surge' });
    expect(store.combat!.left.action).toBe(true);
    bo.receive({ t: 'feature', token: 'bo', feature: 'action-surge' });
    expect(errors(bo)[0]).toMatch(/no uses left/);
  });

  it('gives slots and uses back when the GM calls a rest', () => {
    const gm = join_('gm');
    store.setToken({ ...tok('hero'), spent: { slots: [2, 1] }, hp: 3 });
    store.setToken({ ...tok('bo'), spent: { uses: { 'second-wind': 1 } } });
    gm.receive({ t: 'rest', tokens: ['hero', 'bo'], kind: 'short' });
    expect(tok('hero').spent?.slots).toEqual([2, 1]);
    expect(tok('bo').spent).toBeUndefined();
    gm.receive({ t: 'rest', tokens: ['hero'], kind: 'long' });
    expect(tok('hero')).toMatchObject({ spent: undefined, hp: undefined });
    const ana = join_('ana');
    ana.receive({ t: 'rest', tokens: ['hero'], kind: 'long' });
    expect(errors(ana)[0]).toMatch(/GM/);
  });
});
