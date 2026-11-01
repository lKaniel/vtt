import { type Token, TokenSchema } from '@vtt/system-dnd5e';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './game-store.ts';

// Dragging compendium entries onto character sheets and tokens, handing
// items over, and reading the spell scrolls that come of it.

let dir: string;
let store: GameStore;
let game: Game;
let dice: number[];

const face = (n: number, sides = 20) => (n - 1) / sides + 0.001;
const tok = (id: string): Token => store.tokens.get(id)!;
const errors = (ws: FakeSocket) => ws.take('error').map((m) => m.message);
const put = (data: object) => store.setToken(TokenSchema.parse(data));

beforeEach(async () => {
  dir = await makeWorld();
  // Ana is trusted, so she may change her own sheet; Bo is a plain player.
  const seats = JSON.parse(await readFile(join(dir, 'game.json'), 'utf8')) as { players: { role: string }[] };
  seats.players[1]!.role = 'trusted';
  await writeFile(join(dir, 'game.json'), JSON.stringify(seats));
  store = new GameStore(dir);
  await store.load();
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  put({
    ...tok('hero'),
    darkvision: 60,
    stats: { level: 3, maxHp: 20 },
    inventory: [{ item: 'dagger', qty: 2, equipped: true }],
  });
  put({ ...tok('goblin'), monster: 'goblin', x: 250, y: 150 });
});

afterEach(async () => {
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  ws.take('welcome');
  return ws;
}

describe('dropping compendium entries on a sheet', () => {
  it('lets the GM give any creature spells, scrolls, items and features, each one undoable', () => {
    const gm = seat('gm');
    gm.receive({
      t: 'drop',
      what: { kind: 'spell', id: 'shield', rules: '2014' },
      onto: { kind: 'token', id: 'goblin' },
      area: 'spells',
    });
    gm.receive({
      t: 'drop',
      what: { kind: 'spell', id: 'fireball', rules: '2014' },
      onto: { kind: 'token', id: 'goblin' },
      area: 'inventory',
    });
    gm.receive({ t: 'drop', what: { kind: 'item', id: 'shortbow' }, onto: { kind: 'token', id: 'goblin' } });
    gm.receive({
      t: 'drop',
      what: { kind: 'feature', id: 'rage', class: 'barbarian', rules: '2014' },
      onto: { kind: 'token', id: 'goblin' },
    });
    expect(errors(gm)).toEqual([]);
    expect(tok('goblin')).toMatchObject({
      stats: { spells: ['shield'], features: ['barbarian/rage'] },
      inventory: [
        { item: 'spell-scroll', spell: 'fireball', qty: 1 },
        { item: 'shortbow', qty: 1 },
      ],
    });
    gm.receive({ t: 'undo' });
    gm.receive({ t: 'undo' });
    expect(tok('goblin').inventory).toEqual([{ item: 'spell-scroll', spell: 'fireball', qty: 1, equipped: false }]);
    expect(tok('goblin').stats?.features).toBeUndefined();
    gm.receive({ t: 'redo' });
    expect(tok('goblin').inventory).toHaveLength(2);
  });

  it('changes an actor in the Actors list, for the GM only', () => {
    const gm = seat('gm');
    gm.receive({ t: 'drop', what: { kind: 'item', id: 'dagger' }, onto: { kind: 'actor', id: 'hero' } });
    // Hero is linked to its actor, so its token follows.
    expect(store.actors.get('hero')!.inventory).toEqual([{ item: 'dagger', qty: 3, equipped: true }]);
    expect(tok('hero').inventory?.[0]?.qty).toBe(3);
    const ana = seat('ana');
    ana.receive({ t: 'drop', what: { kind: 'item', id: 'dagger' }, onto: { kind: 'actor', id: 'hero' } });
    expect(errors(ana)).toEqual(['Only the GM can do that']);
  });

  it('lets a trusted player fill their own sheet, not anyone else’s', () => {
    const ana = seat('ana');
    ana.receive({ t: 'drop', what: { kind: 'item', id: 'dagger' }, onto: { kind: 'token', id: 'hero' } });
    ana.receive({ t: 'drop', what: { kind: 'item', id: 'dagger' }, onto: { kind: 'token', id: 'goblin' } });
    expect(errors(ana)).toEqual(["You can't edit Goblin"]);
    expect(tok('hero').inventory?.[0]?.qty).toBe(3);
    ana.receive({ t: 'undo' });
    expect(tok('hero').inventory?.[0]?.qty).toBe(2);
    const bo = seat('bo');
    bo.receive({ t: 'drop', what: { kind: 'item', id: 'dagger' }, onto: { kind: 'token', id: 'hero' } });
    expect(errors(bo)).toEqual(["You can't edit Hero"]);
  });

  it('says why a drop does nothing', () => {
    const gm = seat('gm');
    gm.receive({ t: 'drop', what: { kind: 'spell', id: 'nope', rules: '2014' }, onto: { kind: 'token', id: 'hero' } });
    gm.receive({ t: 'drop', what: { kind: 'item', id: 'dagger' }, onto: { kind: 'token', id: 'ghost' } });
    expect(errors(gm)).toEqual(['Hero plays by the 2014 rules, which have no spell "nope"', 'No such token']);
  });
});

describe('handing an item to another creature', () => {
  it('moves the stack from a creature you control to one you can see, as an action only the GM undoes', () => {
    const ana = seat('ana');
    ana.receive({ t: 'give', from: 'hero', to: 'goblin', item: 'dagger' });
    expect(ana.take('chat').at(-1)!.message.text).toBe('Hero hands Goblin 2 × Dagger');
    expect(tok('hero').inventory).toBeUndefined();
    expect(tok('goblin').inventory).toEqual([{ item: 'dagger', qty: 2, equipped: false }]);
    ana.receive({ t: 'undo' });
    expect(errors(ana)).toEqual(['Nothing to undo']);
    seat('gm').receive({ t: 'undo' });
    expect(tok('hero').inventory?.[0]?.qty).toBe(2);
  });

  it('refuses creatures you don’t control, can’t see, or yourself', () => {
    const bo = seat('bo');
    bo.receive({ t: 'give', from: 'hero', to: 'goblin', item: 'dagger' });
    const ana = seat('ana');
    put({ ...tok('goblin'), x: 550 });
    ana.receive({ t: 'give', from: 'hero', to: 'goblin', item: 'dagger' });
    ana.receive({ t: 'give', from: 'hero', to: 'hero', item: 'dagger' });
    ana.receive({ t: 'give', from: 'hero', to: 'goblin', item: 'longsword' });
    expect([...errors(bo), ...errors(ana)]).toEqual([
      "You don't control Hero",
      'No such token',
      'Hand it to another creature',
      'No such token',
    ]);
    expect(tok('hero').inventory?.[0]?.qty).toBe(2);
  });
});

describe('reading a spell scroll', () => {
  it('casts the spell without a slot, with the scroll’s numbers, and uses the scroll up', () => {
    put({ ...tok('hero'), inventory: [{ item: 'spell-scroll', spell: 'magic-missile', qty: 1 }] });
    const ana = seat('ana');
    dice = [face(1, 4), face(1, 4), face(1, 4)];
    ana.receive({
      t: 'cast',
      caster: 'hero',
      spell: 'magic-missile',
      slot: 1,
      scroll: true,
      targets: ['goblin', 'goblin', 'goblin'],
    });
    expect(errors(ana)).toEqual([]);
    expect(tok('goblin').hp).toBe(7 - 6);
    expect(tok('hero').inventory).toBeUndefined();
    expect(tok('hero').spent).toBeUndefined();
    ana.receive({ t: 'cast', caster: 'hero', spell: 'magic-missile', slot: 1, scroll: true, targets: ['goblin'] });
    expect(errors(ana)).toEqual(['Hero has no scroll of Magic Missile']);
  });

  it('casts at the spell’s own level and saves against the scroll’s DC', () => {
    put({ ...tok('hero'), inventory: [{ item: 'spell-scroll', spell: 'hold-person', qty: 2 }] });
    const ana = seat('ana');
    // The goblin's wisdom save: 12 - 1 = 11 fails against DC 13.
    dice = [face(12)];
    ana.receive({ t: 'cast', caster: 'hero', spell: 'hold-person', slot: 5, scroll: true, targets: ['goblin'] });
    expect(errors(ana)).toEqual([]);
    expect(tok('goblin').effects?.map((e) => e.name)).toEqual(['Hold Person']);
    expect(tok('hero').inventory).toEqual([{ item: 'spell-scroll', spell: 'hold-person', qty: 1, equipped: false }]);
    expect(tok('hero').concentration?.spell).toBe('hold-person');
  });
});
