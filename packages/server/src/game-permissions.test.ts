import { ActorSchema } from '@vtt/system-dnd5e';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';

let dir: string;
let store: GameStore;
let game: Game;

beforeEach(async () => {
  dir = await makeWorld();
  // Ana is trusted for these tests; Cy only watches.
  const seats = JSON.parse(await readFile(join(dir, 'game.json'), 'utf8')) as { players: { role: string }[] };
  seats.players[1]!.role = 'trusted';
  seats.players.push({ id: 'cy', name: 'Cy', role: 'observer' } as never);
  await writeFile(join(dir, 'game.json'), JSON.stringify(seats));
  store = new GameStore(dir);
  await store.load();
  game = new Game(store);
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

describe('a trusted player editing their own token', () => {
  it('changes its fields like the GM does', () => {
    const ana = seat('ana');
    ana.receive({ t: 'editToken', token: 'hero', patch: { name: 'Ana the Bold', hp: 7 } });
    expect(ana.take('error')).toEqual([]);
    expect(store.tokens.get('hero')).toMatchObject({ name: 'Ana the Bold', hp: 7 });
  });

  it("can't touch tokens they don't own", () => {
    const ana = seat('ana');
    ana.receive({ t: 'editToken', token: 'goblin', patch: { hp: 1 } });
    expect(ana.take('error')[0]!.message).toBe("You can't edit Goblin");
    expect(store.tokens.get('goblin')!.hp).toBeUndefined();
  });

  it("can't give it away, move it by hand or hide it", () => {
    const ana = seat('ana');
    ana.receive({ t: 'editToken', token: 'hero', patch: { ownership: { default: 'owner' }, x: 9999 } });
    expect(ana.take('error')[0]!.message).toBe('Only the GM can change ownership, x');
    expect(store.tokens.get('hero')).toMatchObject({ ownership: { default: 'limited', ana: 'owner' }, x: 150 });
  });

  it('changes how big its token is and what it sees, never what creature it is', () => {
    const ana = seat('ana');
    ana.receive({ t: 'ops', txn: 't1', ops: [{ op: 'update', coll: 'actors', id: 'hero', patch: { size: 2 } }] });
    expect(ana.take('reject')).toEqual([]);
    ana.receive({ t: 'editToken', token: 'hero', patch: { darkvision: 60, light: { bright: 20, dim: 20 } } });
    ana.receive({ t: 'editToken', token: 'hero', patch: { monster: 'ancient-red-dragon' } });
    expect(ana.take('error').map((e) => e.message)).toEqual(['Only the GM can change monster']);
    expect(store.tokens.get('hero')).toMatchObject({ size: 2, darkvision: 60, light: { bright: 20, dim: 20 } });
  });

  it('changes its picture and how it looks', () => {
    const ana = seat('ana');
    ana.receive({
      t: 'editToken',
      token: 'hero',
      patch: { img: '/assets/uploads/ana.png', scale: 1.2, mirrorX: true },
    });
    expect(ana.take('error')).toEqual([]);
    expect(store.tokens.get('hero')).toMatchObject({ img: '/assets/uploads/ana.png', scale: 1.2, mirrorX: true });
  });

  it('still leaves deleting and spawning to the GM', () => {
    const ana = seat('ana');
    ana.receive({ t: 'deleteToken', token: 'hero' });
    expect(ana.take('error')[0]!.message).toBe('Only the GM can do that');
  });
});

describe('a plain player', () => {
  it("can't change how big its token is and what it sees, or what creature it is", () => {
    store.setToken({ ...store.tokens.get('hero')!, ownership: { default: 'limited', bo: 'owner' } });
    const bo = seat('bo');
    bo.receive({ t: 'ops', txn: 't1', ops: [{ op: 'update', coll: 'actors', id: 'hero', patch: { size: 4 } }] });
    expect(bo.take('reject').map((r) => r.reason)).toEqual(['Only the GM can change size']);
    bo.receive({ t: 'editToken', token: 'hero', patch: { img: '/x.webp', size: 4, darkvision: 600 } });
    bo.receive({ t: 'editToken', token: 'hero', patch: { light: { bright: 999, dim: 0 }, scale: 3 } });
    bo.receive({ t: 'editToken', token: 'hero', patch: { monster: 'ancient-red-dragon' } });
    expect(bo.take('error').map((e) => e.message)).toEqual([
      'Only the GM can change size, darkvision',
      'Only the GM can change light',
      'Only the GM can change monster',
    ]);
    expect(store.tokens.get('hero')).toMatchObject({ size: 1, darkvision: 0 });
    expect(store.tokens.get('hero')!.img).toBeUndefined();
  });

  it('edits their own token like a trusted one', () => {
    store.setToken({ ...store.tokens.get('hero')!, ownership: { default: 'limited', bo: 'owner' } });
    const bo = seat('bo');
    bo.receive({ t: 'editToken', token: 'hero', patch: { hp: 9, img: '/assets/uploads/bo.png' } });
    expect(bo.take('error')).toEqual([]);
    expect(store.tokens.get('hero')).toMatchObject({ hp: 9, img: '/assets/uploads/bo.png' });
  });

  it('saves the sheet of an actor they own, but no other, and not its GM fields', () => {
    const bo = seat('bo');
    store.setActor(ActorSchema.parse({ id: 'mira', name: 'Mira', ownership: { default: 'none', bo: 'owner' } }));
    bo.receive({
      t: 'saveActor',
      actor: { id: 'mira', name: 'Mira the Wise', ownership: { default: 'none', bo: 'owner' } },
    });
    expect(bo.take('error')).toEqual([]);
    expect(store.actors.get('mira')!.name).toBe('Mira the Wise');
    store.setActor(ActorSchema.parse({ id: 'bandit', name: 'Bandit' }));
    bo.receive({ t: 'saveActor', actor: { id: 'bandit', name: 'Mine now' } });
    bo.receive({
      t: 'saveActor',
      actor: { id: 'mira', name: 'Mira', size: 4, ownership: { default: 'none', bo: 'owner' } },
    });
    bo.receive({ t: 'saveActor', actor: { id: 'mira', name: 'Mira', ownership: { default: 'owner' } } });
    expect(bo.take('error').map((e) => e.message)).toEqual([
      "You can't edit Bandit",
      'Only the GM can change size',
      'Only the GM can change ownership',
    ]);
    expect(store.actors.get('mira')!.name).toBe('Mira the Wise');
  });
});

describe('an observer seat', () => {
  it('sees the party sheet but cannot move it or open doors', () => {
    store.setToken({
      ...store.tokens.get('hero')!,
      monster: 'goblin',
      ownership: { default: 'limited', ana: 'owner', cy: 'owner' },
    });
    const ws = new FakeSocket();
    game.connect(ws.asWebSocket, game.findPlayer('cy')!);
    const hero = ws.take('welcome')[0]!.tokens.find((t) => t.id === 'hero');
    expect(hero?.sheet).toBeDefined();
    ws.receive({ t: 'move', token: 'hero', to: [250, 250] });
    ws.receive({ t: 'door', chunk: '0_0', wall: 'door', state: 'open' });
    expect(ws.take('error').map((e) => e.message)).toEqual(["You don't control Hero", 'Observers only watch']);
  });
});

describe('the GM granting access', () => {
  it('changes a seat role live, without dropping anyone', async () => {
    const gm = seat('gm');
    const bo = seat('bo');
    gm.receive({ t: 'setRole', player: 'bo', role: 'trusted' });
    expect(gm.take('error')).toEqual([]);
    const welcome = bo.take('welcome');
    expect(welcome[0]!.you.role).toBe('trusted');
    expect(bo.readyState).toBe(1);
    await store.flush();
    const saved = JSON.parse(await readFile(join(dir, 'game.json'), 'utf8')) as {
      players: { id: string; role: string }[];
    };
    expect(saved.players.find((p) => p.id === 'bo')!.role).toBe('trusted');
  });

  it('keeps at least one GM', () => {
    const gm = seat('gm');
    gm.receive({ t: 'setRole', player: 'gm', role: 'player' });
    expect(gm.take('error')[0]!.message).toBe('The table needs a GM');
  });

  it('is for the GM only', () => {
    const ana = seat('ana');
    ana.receive({ t: 'setRole', player: 'ana', role: 'gm' });
    expect(ana.take('error')[0]!.message).toBe('Only the GM can do that');
  });

  it('sets per-token ownership levels', () => {
    const gm = seat('gm');
    gm.receive({ t: 'editToken', token: 'goblin', patch: { ownership: { default: 'limited', bo: 'observer' } } });
    expect(store.tokens.get('goblin')!.ownership).toEqual({ default: 'limited', bo: 'observer' });
  });
});
