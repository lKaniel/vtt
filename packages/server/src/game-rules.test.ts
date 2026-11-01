// Rules automation on top of spells and attacks: temporary hit points, items, riders.
import { type Token, TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './game-store.ts';

let store: GameStore;
let game: Game;
/** What the next random numbers will be; 0.5 once they run out. */
let dice: number[];

/** The rng value that rolls `n` on a die with `sides` sides. */
const face = (n: number, sides = 20) => (n - 1) / sides + 0.001;

function put(data: object): void {
  store.setToken(TokenSchema.parse(data));
}

beforeEach(async () => {
  store = new GameStore(await makeWorld());
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
        'thunderwave',
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
    ownership: { default: 'limited', bo: 'owner' },
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

describe('temporary hit points, drains and items', () => {
  const learn = (...spells: string[]) =>
    store.setToken({
      ...tok('hero'),
      stats: { ...tok('hero').stats, spells: [...tok('hero').stats!.spells!, ...spells] },
    });

  it('gives temporary hit points with false life and loses them first', () => {
    learn('false-life');
    const ana = join_('ana');
    dice = [face(4, 4)];
    ana.receive({ t: 'cast', caster: 'hero', spell: 'false-life', slot: 1, targets: [] });
    expect(tok('hero').tempHp).toBe(8);
    dice = Array<number>(3).fill(face(1, 4));
    ana.receive({ t: 'cast', caster: 'hero', spell: 'magic-missile', slot: 1, targets: ['hero', 'hero', 'hero'] });
    expect(tok('hero').tempHp).toBe(2);
    expect(tok('hero').hp).toBeUndefined();
  });

  it('heals the caster from a vampiric touch', () => {
    learn('vampiric-touch');
    store.setToken({ ...tok('hero'), hp: 10 });
    store.setToken({ ...tok('goblin'), x: 150, y: 50 });
    const ana = join_('ana');
    // d20 of 19 hits; 3d6 of 2s = 6 necrotic, the goblin has 7 hp, the caster regains 3.
    dice = [face(19), face(2, 6), face(2, 6), face(2, 6)];
    ana.receive({ t: 'cast', caster: 'hero', spell: 'vampiric-touch', slot: 3, targets: ['goblin'] });
    expect(tok('goblin').hp).toBe(1);
    expect(tok('hero').hp).toBe(13);
    expect(spellLogs(ana)[0]!.notes).toContain('Wiz regains 3 HP');
  });

  it('wakes a sleeping creature when it takes damage', () => {
    const asleep = { id: 'sleep-hero', name: 'Sleep', conditions: ['unconscious' as const], endsOnDamage: true };
    store.setToken({ ...tok('goblin'), effects: [asleep] });
    const ana = join_('ana');
    dice = [face(15), face(1, 10)];
    ana.receive({ t: 'cast', caster: 'hero', spell: 'fire-bolt', slot: 0, targets: ['goblin'] });
    expect(tok('goblin').effects).toBeUndefined();
  });

  it('drinks a potion of healing from the inventory: an action in 2014', () => {
    store.setToken({
      ...tok('bo'),
      hp: 10,
      inventory: [...tok('bo').inventory!, { item: 'potion-of-healing', equipped: false, qty: 2 }],
    });
    const { bo } = fight(['bo', 'hero', 'goblin', 'goblin2']);
    dice = [face(4, 4), face(4, 4)];
    bo.receive({ t: 'useItem', token: 'bo', item: 'potion-of-healing' });
    expect(tok('bo').hp).toBe(20);
    expect(tok('bo').inventory?.at(-1)).toMatchObject({ item: 'potion-of-healing', qty: 1 });
    expect(store.combat!.left.action).toBe(false);
    bo.receive({ t: 'useItem', token: 'bo', item: 'rope' });
    expect(errors(bo)[0]).toMatch(/doesn't carry/);
  });
});

describe('riders on hits', () => {
  const paladin = () =>
    store.setToken({
      ...tok('bo'),
      stats: { class: 'paladin', level: 5, maxHp: 40, abilities: { str: 16, cha: 14 }, spells: ['divine-favor'] },
    });

  it('smites on a melee hit, spending the slot only when it lands (2014 paladin)', () => {
    paladin();
    store.setToken({ ...tok('goblin2'), x: 150, y: 250 });
    const { bo } = fight(['bo', 'hero', 'goblin', 'goblin2']);
    dice = [face(2)];
    bo.receive({ t: 'attack', attacker: 'bo', target: 'goblin2', attack: 'Longsword', smite: 1 });
    expect(tok('bo').spent).toBeUndefined();
    dice = [face(15), face(1, 8), face(2, 8), face(2, 8)];
    bo.receive({ t: 'attack', attacker: 'bo', target: 'goblin2', attack: 'Longsword', smite: 1 });
    expect(tok('bo').spent?.slots).toEqual([1]);
    expect(tok('goblin2').hp).toBe(0);
    bo.receive({ t: 'attack', attacker: 'bo', target: 'goblin', attack: 'Longsword', smite: 3 });
    expect(errors(bo)[0]).toMatch(/no 3rd-level slots/);
  });

  it('adds divine favor to the paladin’s weapon hits', () => {
    paladin();
    store.setToken({ ...tok('goblin2'), x: 150, y: 250 });
    const { bo } = fight(['bo', 'hero', 'goblin', 'goblin2']);
    bo.receive({ t: 'cast', caster: 'bo', spell: 'divine-favor', slot: 1, targets: [] });
    expect(tok('bo').hp).toBeUndefined();
    dice = [face(15), face(1, 8), face(3, 4)];
    bo.receive({ t: 'attack', attacker: 'bo', target: 'goblin2', attack: 'Longsword' });
    expect(tok('goblin2').hp).toBe(7 - (1 + 3) - 3);
  });
});

describe('basic actions and class features', () => {
  it('dashes for more movement and dodges until the next turn', () => {
    const { bo } = fight(['bo', 'hero', 'goblin', 'goblin2']);
    bo.receive({ t: 'feature', token: 'bo', feature: 'dash' });
    expect(store.combat!.left).toMatchObject({ move: 60, action: false });
    store.setCombat({ ...store.combat!, left: { ...store.combat!.left, action: true } });
    bo.receive({ t: 'feature', token: 'bo', feature: 'dodge' });
    expect(tok('bo').effects?.[0]).toMatchObject({ name: 'Dodging', disadvantageAgainst: true });
  });

  it('lays on hands: heals a touched ally from the pool, as much as it misses', () => {
    store.setToken({ ...tok('bo'), stats: { ...tok('bo').stats, class: 'paladin', level: 2 } });
    store.setToken({ ...tok('hero'), x: 50, y: 150, hp: 26 });
    const bo = join_('bo');
    bo.receive({ t: 'feature', token: 'bo', feature: 'lay-on-hands', targets: ['hero'] });
    expect(tok('hero').hp).toBeUndefined();
    expect(tok('bo').spent?.uses).toEqual({ 'lay-on-hands': 4 });
  });

  it('inspires an ally with a bardic inspiration die', () => {
    store.setToken({ ...tok('hero'), stats: { ...tok('hero').stats, class: 'bard', abilities: { cha: 16 } } });
    const ana = join_('ana');
    ana.receive({ t: 'feature', token: 'hero', feature: 'bardic-inspiration', targets: ['bo'] });
    expect(tok('bo').effects?.[0]).toMatchObject({ name: 'Bardic Inspiration', attackBonus: '1d8', once: true });
    expect(tok('hero').spent?.uses).toEqual({ 'bardic-inspiration': 1 });
  });

  it('turns undead around the cleric, using Channel Divinity', () => {
    store.setToken({ ...tok('hero'), stats: { ...tok('hero').stats, class: 'cleric', abilities: { wis: 16 } } });
    store.setToken({ ...tok('goblin'), monster: 'zombie', x: 150, y: 50 });
    const ana = join_('ana');
    dice = [face(1)];
    ana.receive({ t: 'feature', token: 'hero', feature: 'turn-undead', targets: [] });
    expect(tok('goblin').effects?.[0]).toMatchObject({ name: 'Turned', conditions: ['frightened'] });
    expect(tok('goblin2').effects).toBeUndefined();
    expect(tok('hero').spent?.uses).toEqual({ 'channel-divinity': 1 });
  });
});

describe('lasting zones and repeated attacks', () => {
  const learn = (...spells: string[]) =>
    store.setToken({
      ...tok('hero'),
      stats: { ...tok('hero').stats, class: 'cleric', spells, abilities: { wis: 16 } },
    });

  it('hurts enemies that start their turn in spirit guardians, sparing allies (2014)', () => {
    learn('spirit-guardians');
    store.setToken({ ...tok('goblin'), x: 150, y: 50 });
    store.setToken({ ...tok('bo'), x: 50, y: 150 });
    const { ana, gm } = fight(['hero', 'goblin', 'bo', 'goblin2']);
    ana.receive({ t: 'cast', caster: 'hero', spell: 'spirit-guardians', slot: 3, targets: [], point: [150, 50] });
    expect(tok('goblin').hp).toBeUndefined();
    expect(tok('hero').effects?.[0]).toMatchObject({
      zone: { spell: 'spirit-guardians', slot: 3 },
      concentration: true,
    });
    // The goblin fails its Wis save (1) and takes 3d8 of 1s.
    dice = [face(1), face(1, 8), face(1, 8), face(1, 8)];
    ana.receive({ t: 'endTurn' });
    expect(tok('goblin').hp).toBe(4);
    gm.receive({ t: 'endTurn' });
    expect(tok('bo').hp).toBeUndefined();
  });

  it('hurts a creature that walks into a moonbeam, once per turn', () => {
    learn('moonbeam');
    const { ana, gm } = fight(['hero', 'goblin', 'bo', 'goblin2']);
    ana.receive({ t: 'cast', caster: 'hero', spell: 'moonbeam', slot: 2, targets: [], point: [250, 250] });
    expect(errors(ana)).toEqual([]);
    ana.receive({ t: 'endTurn' });
    // The goblin fails its Con save (1) and takes 2d10 of 1s.
    dice = [face(1), face(1, 10), face(1, 10)];
    gm.receive({ t: 'move', token: 'goblin', to: [250, 250] });
    expect(tok('goblin').hp).toBe(5);
    gm.receive({ t: 'move', token: 'goblin', to: [250, 150] });
    gm.receive({ t: 'move', token: 'goblin', to: [250, 250] });
    expect(tok('goblin').hp).toBe(5);
  });

  it('attacks again with a spiritual weapon as a bonus action, without a new slot', () => {
    learn('spiritual-weapon');
    const { ana } = fight(['hero', 'goblin', 'bo', 'goblin2']);
    dice = [face(2)];
    ana.receive({ t: 'cast', caster: 'hero', spell: 'spiritual-weapon', slot: 2, targets: ['goblin'] });
    expect(errors(ana)).toEqual([]);
    expect(tok('hero').spent?.slots).toEqual([0, 1]);
    ana.receive({ t: 'endTurn' });
    store.setCombat({ ...store.combat!, turn: 0, left: { ...store.combat!.left, bonus: true } });
    dice = [face(2)];
    ana.receive({ t: 'cast', caster: 'hero', spell: 'spiritual-weapon', slot: 2, targets: ['goblin'], repeat: true });
    expect(errors(ana)).toEqual([]);
    expect(tok('hero').spent?.slots).toEqual([0, 1]);
    expect(store.combat!.left.bonus).toBe(false);
  });

  it('refuses to repeat a spell that isn’t going', () => {
    learn('spiritual-weapon');
    const ana = join_('ana');
    ana.receive({ t: 'cast', caster: 'hero', spell: 'spiritual-weapon', slot: 2, targets: ['goblin'], repeat: true });
    expect(errors(ana)[0]).toMatch(/isn't going/);
  });
});

describe('dying and death saves', () => {
  it('rolls a death save when a downed character’s turn comes, then passes the turn', () => {
    store.setToken({ ...tok('bo'), hp: 0 });
    const { gm } = fight(['hero', 'bo', 'goblin', 'goblin2']);
    store.setCombat({ ...store.combat!, turn: 0 });
    dice = [face(8)];
    gm.receive({ t: 'endTurn' });
    expect(tok('bo').deathSaves).toMatchObject({ successes: 0, failures: 1 });
    expect(store.combat!.order[store.combat!.turn]!.token).toBe('goblin');
  });

  it('fails a death save when hit while down, and dies at three', () => {
    store.setToken({ ...tok('hero'), hp: 0, deathSaves: { successes: 0, failures: 2 } });
    store.setToken({ ...tok('goblin'), x: 150, y: 50 });
    const { gm } = fight(['goblin', 'hero', 'bo', 'goblin2']);
    dice = [face(15), face(1, 6), face(1, 6)];
    gm.receive({ t: 'attack', attacker: 'goblin', target: 'hero', attack: 'Scimitar' });
    expect(tok('hero').deathSaves).toMatchObject({ dead: true });
  });

  it('stabilizes a dying creature with spare the dying', () => {
    store.setToken({ ...tok('hero'), stats: { ...tok('hero').stats, spells: ['spare-the-dying'] } });
    store.setToken({ ...tok('bo'), x: 50, y: 150, hp: 0, deathSaves: { successes: 1, failures: 2 } });
    const ana = join_('ana');
    ana.receive({ t: 'cast', caster: 'hero', spell: 'spare-the-dying', slot: 0, targets: ['bo'] });
    expect(tok('bo').deathSaves).toMatchObject({ stable: true });
  });
});

describe('opportunity attacks', () => {
  it('offers the enemy an attack when a creature walks out of its reach, once per round', () => {
    store.setToken({ ...tok('goblin'), x: 150, y: 250 });
    const { bo, gm } = fight(['bo', 'goblin', 'hero', 'goblin2']);
    bo.receive({ t: 'move', token: 'bo', to: [50, 50] });
    const [offer] = gm.take('reactionOffer');
    expect(offer).toMatchObject({ offer: { reactor: 'goblin', target: 'bo', kind: 'opportunity' } });
    expect(bo.take('reactionOffer')).toEqual([]);
    dice = [face(19), face(3, 6)];
    gm.receive({ t: 'react', offer: offer!.offer.id, choice: 'Scimitar' });
    expect(tok('bo').hp).toBe(40 - 5);
    expect(store.combat!.reacted).toEqual(['goblin']);
    expect(store.combat!.left.action).toBe(true);
    gm.receive({ t: 'react', offer: offer!.offer.id, choice: 'Scimitar' });
    expect(errors(gm)[0]).toMatch(/passed/);
  });

  it('makes no offer when the creature disengaged first', () => {
    store.setToken({ ...tok('goblin'), x: 150, y: 250 });
    const { bo, gm } = fight(['bo', 'goblin', 'hero', 'goblin2']);
    bo.receive({ t: 'feature', token: 'bo', feature: 'disengage' });
    bo.receive({ t: 'move', token: 'bo', to: [50, 50] });
    expect(gm.take('reactionOffer')).toEqual([]);
  });
});

describe('monk', () => {
  it('flurry of blows gives two more attacks for a ki point', () => {
    store.setToken({ ...tok('bo'), stats: { class: 'monk', level: 5, maxHp: 30, abilities: { dex: 16, wis: 14 } } });
    const { bo } = fight(['bo', 'goblin', 'hero', 'goblin2']);
    bo.receive({ t: 'feature', token: 'bo', feature: 'flurry-of-blows' });
    expect(store.combat!.left).toMatchObject({ bonus: false, attacks: 2, action: true });
    expect(tok('bo').spent?.uses).toEqual({ ki: 1 });
  });
});

describe('two-weapon fighting', () => {
  it('attacks with the off hand as a bonus action after a light-weapon attack', () => {
    const swords = [
      { item: 'shortsword', equipped: true, qty: 1 },
      { item: 'shortsword', equipped: true, qty: 1 },
    ];
    store.setToken({ ...tok('bo'), x: 150, y: 250, inventory: swords });
    const { bo } = fight(['bo', 'goblin', 'hero', 'goblin2']);
    const offHand = { t: 'attack', attacker: 'bo', target: 'goblin2', attack: 'Shortsword (off-hand)' } as const;
    bo.receive(offHand);
    expect(errors(bo)).toEqual(['Fighter must attack with a light weapon first']);
    bo.receive({ ...offHand, attack: 'Shortsword' });
    bo.receive(offHand);
    expect(errors(bo)).toEqual([]);
    expect(store.combat!.left).toMatchObject({ bonus: false });
  });
});
