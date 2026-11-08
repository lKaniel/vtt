import { type Token, TokenSchema } from '@vtt/system-dnd5e';
import { poolCaster } from '@vtt/system-dnd5e/fixtures/pool-class';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';

// A pool class at the table (an illusionist's Lucidity): features cost
// points by the weight of their targets and the options picked, lasting ones
// hold their cost while their effects last, Glamours lower the maximums, and
// Weaves share one concentration.

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
    TokenSchema.parse(poolCaster(1, { x: 50, y: 50, darkvision: 60, ownership: { default: 'limited', ana: 'owner' } })),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), x: 250, y: 50, monster: 'goblin' }));
  store.setToken(TokenSchema.parse({ id: 'goblin2', name: 'Goblin 2', x: 250, y: 150, monster: 'goblin' }));
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
const errors = (ws: FakeSocket) => ws.take('error').map((m) => m.message);
const set = (id: string, over: Partial<Token>) => store.setToken({ ...tok(id), ...over });
const weave = (targets: string[], picks = ['sight', 'sound'], extra = {}) => ({
  t: 'feature' as const,
  token: 'nyx',
  feature: 'weave',
  targets,
  picks,
  ...extra,
});

function fight(order: string[]): { ana: FakeSocket; gm: FakeSocket } {
  const ana = join_('ana');
  const gm = join_('gm');
  dice = order.map((_, i) => face(20 - 5 * i));
  gm.receive({ t: 'combatStart', tokens: order });
  ana.sent = [];
  return { ana, gm };
}

describe('weaving an illusion', () => {
  it('costs base × senses × Mind Weight and holds it while the Weave lasts', () => {
    const ana = join_('ana');
    ana.receive(weave(['goblin']));
    expect(errors(ana)).toEqual([]);
    // a goblin: CR 1/4 (tier 1), Wis 8 (× 0.5); two senses
    expect(tok('nyx').spent?.pool).toBe(1);
    expect(tok('nyx').holds).toMatchObject([{ feature: 'weave', cost: 1 }]);
    expect(tok('nyx').concentration).toMatchObject({ spell: 'weave' });
    expect(tok('goblin').effects).toMatchObject([{ name: 'Weave', linked: true, source: 'nyx', concentration: true }]);
  });

  it('keeps earlier Weaves going under the same concentration, and frees their hold when it ends', () => {
    const ana = join_('ana');
    ana.receive(weave(['goblin']));
    ana.receive(weave(['goblin2'], ['sight']));
    expect(errors(ana)).toEqual([]);
    expect(tok('goblin').effects?.length).toBe(1);
    expect(tok('goblin2').effects?.length).toBe(1);
    expect(tok('nyx').holds?.length).toBe(2);
    ana.receive({ t: 'dropConcentration', token: 'nyx' });
    expect(tok('goblin').effects).toBeUndefined();
    expect(tok('nyx').holds).toBeUndefined();
    expect(tok('nyx').spent?.pool).toBe(1.5);
  });

  it('refuses a Weave the concurrent share has no room for', () => {
    const ana = join_('ana');
    // 4 base × 2 senses × 1 = 8 > 6 (half of 12)
    ana.receive(weave(['goblin', 'goblin2'], ['sight', 'sound'], { inputs: { base: 4 } }));
    expect(errors(ana)[0]).toMatch(/Concurrent|room|Lucidity/i);
    expect(tok('nyx').spent).toBeUndefined();
  });

  it('refuses what the pool can no longer pay', () => {
    const ana = join_('ana');
    set('nyx', { spent: { pool: 11.5 } });
    ana.receive(weave(['goblin']));
    expect(errors(ana)[0]).toMatch(/Lucidity/);
  });

  it('refuses senses it has not learned', () => {
    const ana = join_('ana');
    ana.receive(weave(['goblin'], ['pain']));
    expect(errors(ana)[0]).toMatch(/pain/i);
  });

  it('weaves as a bonus action when it costs a quarter of the pool or less', () => {
    const { ana } = fight(['nyx', 'goblin', 'goblin2']);
    ana.receive(weave(['goblin'], ['sight', 'sound'], { bonus: true }));
    expect(errors(ana)).toEqual([]);
    expect(store.combat!.left).toMatchObject({ action: true, bonus: false });
    ana.receive(weave(['goblin', 'goblin2'], ['sight', 'sound'], { bonus: true, inputs: { base: 2 } }));
    expect(errors(ana)[0]).toMatch(/bonus/);
  });
});

describe('a bolt with shapes', () => {
  it('pays each shape by the target weight, half against a linked one', () => {
    const ana = join_('ana');
    dice = [face(18), face(5, 10)];
    ana.receive({ t: 'feature', token: 'nyx', feature: 'bolt', targets: ['goblin'], picks: ['disorienting'] });
    expect(errors(ana)).toEqual([]);
    expect(tok('nyx').spent?.pool).toBe(0.5);
    expect(tok('goblin').effects).toMatchObject([{ name: 'Disoriented', speed: -10 }]);
    ana.receive(weave(['goblin2']));
    dice = [face(18), face(5, 10)];
    ana.receive({ t: 'feature', token: 'nyx', feature: 'bolt', targets: ['goblin2'], picks: ['disorienting'] });
    expect(tok('nyx').spent?.pool).toBe(0.5 + 1 + 0.25);
  });

  it('only reaches linked creatures with a volley, at any distance', () => {
    const ana = join_('ana');
    set('nyx', { stats: { ...tok('nyx').stats, level: 5 } });
    ana.receive({ t: 'feature', token: 'nyx', feature: 'volley', targets: ['goblin'] });
    expect(errors(ana)[0]).toMatch(/linked/);
    ana.receive(weave(['goblin']));
    set('goblin', { x: 5000, y: 5000 });
    dice = [face(5, 10), face(2)];
    ana.receive({ t: 'feature', token: 'nyx', feature: 'volley', targets: ['goblin'] });
    expect(errors(ana)).toEqual([]);
    expect(tok('goblin').hp).toBeLessThan(7);
  });
});

describe('a Glamour', () => {
  it('lowers both maximums until it is let go, and only outside a fight', () => {
    const ana = join_('ana');
    set('nyx', { stats: { ...tok('nyx').stats, level: 2 } });
    ana.receive({ t: 'feature', token: 'nyx', feature: 'glamour', picks: ['sight', 'sound'], inputs: { strength: 2 } });
    expect(errors(ana)).toEqual([]);
    expect(tok('nyx').spent).toBeUndefined();
    const [hold] = tok('nyx').holds!;
    expect(hold).toMatchObject({ feature: 'glamour', cost: 4, reserve: true });
    expect(tok('nyx').effects).toMatchObject([{ name: 'Glamour', hold: hold!.id }]);
    ana.receive({ t: 'release', token: 'nyx', hold: hold!.id });
    expect(tok('nyx').holds).toBeUndefined();
    expect(tok('nyx').effects).toBeUndefined();
  });

  it('takes too long in a fight', () => {
    set('nyx', { stats: { ...tok('nyx').stats, level: 2 } });
    const { ana } = fight(['nyx', 'goblin', 'goblin2']);
    ana.receive({ t: 'feature', token: 'nyx', feature: 'glamour', picks: ['sight'] });
    expect(errors(ana)[0]).toMatch(/fight/);
  });
});

describe('action rules for pool features', () => {
  const level = (n: number) => set('nyx', { stats: { ...tok('nyx').stats, level: n } });

  it('fires a bolt as a bonus action after weaving with the action (Twin Thought)', () => {
    level(6);
    const { ana } = fight(['nyx', 'goblin', 'goblin2']);
    ana.receive({ t: 'feature', token: 'nyx', feature: 'bolt', targets: ['goblin'], bonus: true });
    expect(errors(ana)[0]).toMatch(/bonus action/);
    ana.receive(weave(['goblin'], ['sight', 'sound'], { inputs: { base: 4 } }));
    dice = [face(18), face(5, 10)];
    ana.receive({ t: 'feature', token: 'nyx', feature: 'bolt', targets: ['goblin2'], bonus: true });
    expect(errors(ana)).toEqual([]);
    expect(store.combat!.left).toMatchObject({ action: false, bonus: false });
  });

  it('weaves anything as a bonus action once a turn (Fluid Weaving)', () => {
    level(11);
    const { ana } = fight(['nyx', 'goblin', 'goblin2']);
    const big = { bonus: true, inputs: { base: 20 } };
    ana.receive(weave(['goblin'], ['sight', 'sound'], big));
    expect(errors(ana)).toEqual([]);
    store.setCombat({ ...store.combat!, left: { ...store.combat!.left, bonus: true } });
    ana.receive(weave(['goblin2'], ['sight', 'sound'], big));
    expect(errors(ana)[0]).toMatch(/bonus action/);
  });

  it('haunts the light minds around the illusionist', () => {
    level(5);
    const ana = join_('ana');
    set('goblin', { x: 100, y: 50 });
    set('goblin2', { x: 450, y: 450 });
    ana.receive({ t: 'feature', token: 'nyx', feature: 'zone', picks: ['sight'] });
    expect(errors(ana)).toEqual([]);
    expect(tok('nyx').spent?.pool).toBe(4);
    expect(tok('goblin').effects).toMatchObject([{ name: 'Haunted', linked: true, source: 'nyx' }]);
    expect(tok('goblin2').effects).toBeUndefined();
  });

  it('rewrites once for free, then for Mind Weight × 10', () => {
    level(13);
    const ana = join_('ana');
    set('goblin', { x: 100, y: 50 });
    ana.receive({ t: 'feature', token: 'nyx', feature: 'rewrite', targets: ['goblin'] });
    expect(tok('nyx').spent?.pool).toBeUndefined();
    ana.receive({ t: 'feature', token: 'nyx', feature: 'rewrite', targets: ['goblin'] });
    expect(errors(ana)).toEqual([]);
    expect(tok('nyx').spent?.pool).toBe(5);
  });

  it('ends a Glamour to set off a Glamour Bomb', () => {
    level(16);
    const ana = join_('ana');
    ana.receive({ t: 'feature', token: 'nyx', feature: 'bomb', point: [50, 50] });
    expect(errors(ana)[0]).toMatch(/nothing/);
    ana.receive({ t: 'feature', token: 'nyx', feature: 'glamour', picks: ['sight'] });
    set('goblin', { x: 100, y: 50 });
    dice = [face(5, 10), face(2)];
    ana.receive({ t: 'feature', token: 'nyx', feature: 'bomb', point: [50, 50] });
    expect(errors(ana)).toEqual([]);
    expect(tok('nyx').holds).toBeUndefined();
    expect(tok('goblin').hp ?? 7).toBeLessThan(7);
  });

  it('lets one illusory creature fight: its numbers come from the class level and the pool (Shadow Substance)', () => {
    level(14);
    const ana = join_('ana');
    ana.receive({ t: 'feature', token: 'nyx', feature: 'shadow-substance', point: [150, 150] });
    expect(errors(ana)).toEqual([]);
    const shadow = [...store.tokens.values()].find((t) => t.summon?.by === 'nyx')!;
    expect(shadow).toMatchObject({ name: 'Shadow Substance', summon: { concentration: true } });
    const sheet = game.table.sheetOf(shadow)!;
    // 5 × level hp, attacks with proficiency + Wis, half the ×3.5 bolt
    expect(sheet).toMatchObject({ maxHp: 70, ac: 18 });
    expect(sheet.attacks[0]).toMatchObject({ toHit: 8, damage: [{ dice: '1d10+3', type: 'psychic', times: 1.75 }] });
    expect(tok('nyx').concentration).toMatchObject({ spell: 'weave' });
    ana.receive({ t: 'dropConcentration', token: 'nyx' });
    expect(store.tokens.has(shadow.id)).toBe(false);
  });
});
