import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DAY, HOUR, MINUTE } from '@vtt/shared';
import { type Token, TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// World time: the GM runs, stops and skips the clock; what lasts (effects,
// concentration, summons, templates) ends when its time is up; rests and
// fight rounds move the clock; turn-based mode outside fights; all undoable.

let dir: string;
let store: GameStore;
let game: Game;
let dice: number[];
let now: number;
const face = (n: number, sides = 20) => (n - 1) / sides + 0.001;
const tok = (id: string): Token => store.tokens.get(id)!;
const clock = () => game.clock.current();

beforeEach(async () => {
  dir = await makeWorld();
  store = new GameStore(dir);
  await store.load();
  dice = [];
  now = 1_000_000;
  game = new Game(store, { rng: () => dice.shift() ?? 0.5, now: () => now });
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      x: 50,
      y: 50,
      darkvision: 60,
      stats: {
        class: 'wizard',
        level: 5,
        maxHp: 30,
        abilities: { int: 16 },
        spells: ['hold-person', 'find-familiar', 'mage-armor'],
      },
    }),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), x: 250, y: 250, monster: 'goblin' }));
});

afterEach(async () => {
  game.close();
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  return ws;
}

const errors = (ws: FakeSocket) => ws.take('error').map((m) => m.message);
const said = (ws: FakeSocket) => ws.take('chat').map((m) => m.message.text);

describe('the clock', () => {
  it('starts, runs and stops for the GM, and is saved in time.json', async () => {
    const gm = seat('gm');
    gm.receive({ t: 'clock', action: { do: 'start' } });
    now += 90_000;
    expect(game.clock.now()).toBe(90);
    gm.receive({ t: 'clock', action: { do: 'stop' } });
    now += 90_000;
    expect(game.clock.now()).toBe(90);
    await store.flush();
    const saved = JSON.parse(await readFile(join(dir, 'time.json'), 'utf8')) as { time: number; running: boolean };
    expect(saved).toMatchObject({ time: 90, running: false });
  });

  it('is known to the players but only the GM changes it', () => {
    const ana = seat('ana');
    expect(ana.take('welcome')[0]!.docs?.time?.[0]).toMatchObject({ id: 'clock', time: 0 });
    ana.receive({ t: 'clock', action: { do: 'skip', seconds: HOUR } });
    expect(errors(ana)).toEqual(['Only the GM can do that']);
    seat('gm').receive({ t: 'clock', action: { do: 'skip', seconds: HOUR } });
    expect(ana.take('docs').at(-1)?.changes[0]?.doc).toMatchObject({ time: HOUR });
  });

  it('sets the date, the speed and the calendar', () => {
    const gm = seat('gm');
    gm.receive({ t: 'clock', action: { do: 'set', time: 3 * DAY } });
    gm.receive({ t: 'clock', action: { do: 'speed', speed: 60 } });
    gm.receive({ t: 'clock', action: { do: 'calendar', calendar: { weekdays: ['One', 'Two'], epochYear: 1492 } } });
    expect(clock()).toMatchObject({ time: 3 * DAY, speed: 60, calendar: { weekdays: ['One', 'Two'], epochYear: 1492 } });
    expect(said(gm).at(-1)).toMatch(/^Two, 4 January 1492/);
  });

  it('undoes a time skip, and what it ended comes back', () => {
    const ana = seat('ana');
    const gm = seat('gm');
    ana.receive({ t: 'cast', caster: 'hero', spell: 'mage-armor', slot: 1, targets: ['hero'] });
    expect(tok('hero').effects?.[0]).toMatchObject({ name: 'Mage Armor', endsAt: 8 * HOUR });
    gm.receive({ t: 'clock', action: { do: 'skip', seconds: 9 * HOUR } });
    expect(tok('hero').effects).toBeUndefined();
    expect(said(gm)).toContain('Mage Armor ends on Hero');
    gm.receive({ t: 'undo' });
    expect(game.clock.now()).toBe(0);
    expect(tok('hero').effects?.[0]).toMatchObject({ name: 'Mage Armor' });
    expect(gm.take('undone')[0]).toMatchObject({ label: 'time skip' });
  });
});

describe('what lasts runs out', () => {
  it('ends concentration and the effects it keeps up when the spell’s minute is over', () => {
    const ana = seat('ana');
    const gm = seat('gm');
    dice = [face(1)];
    ana.receive({ t: 'cast', caster: 'hero', spell: 'hold-person', slot: 2, targets: ['goblin'] });
    expect(errors(ana)).toEqual([]);
    expect(tok('hero').concentration).toMatchObject({ spell: 'hold-person', endsAt: MINUTE });
    gm.receive({ t: 'clock', action: { do: 'skip', seconds: 59 } });
    expect(tok('goblin').effects).toHaveLength(1);
    gm.receive({ t: 'clock', action: { do: 'skip', seconds: 1 } });
    expect(tok('hero').concentration).toBeUndefined();
    expect(tok('goblin').effects).toBeUndefined();
  });

  it('sends a summon away when its spell runs out', () => {
    const ana = seat('ana');
    ana.receive({
      t: 'cast',
      caster: 'hero',
      spell: 'find-familiar',
      slot: 1,
      targets: [],
      point: [150, 50],
      summon: 'owl',
    });
    const owl = () => [...store.tokens.values()].find((t) => t.monster === 'owl');
    expect(owl()).toBeDefined();
    // Find familiar lasts until dismissed: time doesn't send it away.
    seat('gm').receive({ t: 'clock', action: { do: 'skip', seconds: 30 * DAY } });
    expect(owl()).toBeDefined();
    store.setToken({ ...owl()!, summon: { ...owl()!.summon!, endsAt: 31 * DAY } });
    seat('gm').receive({ t: 'clock', action: { do: 'skip', seconds: DAY } });
    expect(owl()).toBeUndefined();
  });

  it('takes away templates whose time is up', () => {
    const gm = seat('gm');
    const template = { id: 'fog', type: 'template', rev: 0, shape: 'circle', x: 0, y: 0, distance: 20, endsAt: HOUR };
    gm.receive({ t: 'ops', txn: 't', ops: [{ op: 'create', coll: 'main/templates', doc: template }] });
    gm.receive({ t: 'clock', action: { do: 'skip', seconds: HOUR } });
    expect(store.docs.all('main/templates')).toEqual([]);
  });

  it('runs out while the clock runs', () => {
    const ana = seat('ana');
    seat('gm').receive({ t: 'clock', action: { do: 'start' } });
    dice = [face(1)];
    ana.receive({ t: 'cast', caster: 'hero', spell: 'hold-person', slot: 2, targets: ['goblin'] });
    now += 30_000;
    game.clock.tick();
    expect(tok('goblin').effects).toHaveLength(1);
    now += 30_000;
    game.clock.tick();
    expect(tok('goblin').effects).toBeUndefined();
  });
});

describe('rests and rounds move the clock', () => {
  it('lets 8 hours pass on a long rest and 1 hour on a short one', () => {
    const gm = seat('gm');
    gm.receive({ t: 'rest', tokens: ['hero'], kind: 'long' });
    expect(game.clock.now()).toBe(8 * HOUR);
    gm.receive({ t: 'rest', tokens: ['hero'], kind: 'short' });
    expect(game.clock.now()).toBe(9 * HOUR);
  });

  it('holds still in a fight, moves 6 seconds a round and finishes the last one at the end', () => {
    const ana = seat('ana');
    const gm = seat('gm');
    gm.receive({ t: 'clock', action: { do: 'start' } });
    now += 10_000;
    dice = [face(20), face(2)];
    gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
    expect(game.clock.now()).toBe(10);
    now += 60_000;
    expect(game.clock.now()).toBe(10);
    ana.receive({ t: 'endTurn' });
    gm.receive({ t: 'endTurn' });
    expect(store.combat?.round).toBe(2);
    expect(game.clock.now()).toBe(16);
    gm.receive({ t: 'combatEnd' });
    expect(game.clock.now()).toBe(22);
    // The clock was running before the fight, so it runs on.
    now += 5_000;
    expect(game.clock.now()).toBe(27);
  });
});

describe('turn-based mode', () => {
  it('lets the GM put the party into turns outside a fight, and out again', () => {
    const ana = seat('ana');
    const gm = seat('gm');
    ana.receive({ t: 'turnBased', on: true });
    expect(errors(ana)).toEqual(['Only the GM can do that']);
    gm.receive({ t: 'turnBased', on: true });
    expect(store.combat).toMatchObject({ peaceful: true, order: [{ token: 'hero' }] });
    expect(said(gm).at(-1)).toMatch(/^Turn-based mode/);
    gm.receive({ t: 'turnBased', on: false });
    expect(store.combat).toBeUndefined();
    expect(game.clock.now()).toBe(6);
  });

  it('is already on in a fight', () => {
    const gm = seat('gm');
    gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
    gm.receive({ t: 'turnBased', on: true });
    expect(errors(gm)).toEqual(['A fight is on: it is turn-based already']);
    gm.receive({ t: 'turnBased', on: false });
    expect(errors(gm)).toEqual(['End the fight to leave turn-based mode']);
  });
});

describe('darkness following the clock', () => {
  it('lights scenes that follow the clock by the time of day', () => {
    const gm = seat('gm');
    gm.receive({ t: 'ops', txn: 't', ops: [{ op: 'update', coll: 'scenes', id: 'main', patch: { darknessFollowsClock: true } }] });
    expect(store.world.darkness).toBe(1);
    gm.take('lighting');
    gm.receive({ t: 'clock', action: { do: 'skip', seconds: 12 * HOUR } });
    expect(store.world.darkness).toBe(0);
    expect(gm.take('lighting').at(-1)).toEqual({ t: 'lighting', darkness: 0 });
    gm.receive({ t: 'undo' });
    expect(store.world.darkness).toBe(1);
  });
});
