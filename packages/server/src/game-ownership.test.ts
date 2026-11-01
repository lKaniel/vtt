import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Op } from '@vtt/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// Ownership levels on the ops message, undo and the documents each player
// is sent. In the test world Hero is Ana's (an actor with a linked token),
// the goblin nobody's; here Ana is trusted, Bo a plain player who owns the
// goblin's copy "scout", and Cy only watches.

let dir: string;
let store: GameStore;
let game: Game;

beforeEach(async () => {
  dir = await makeWorld();
  const seats = JSON.parse(await readFile(join(dir, 'game.json'), 'utf8')) as { players: { role: string }[] };
  seats.players[1]!.role = 'trusted';
  seats.players.push({ id: 'cy', name: 'Cy', role: 'observer' } as never);
  await writeFile(join(dir, 'game.json'), JSON.stringify(seats));
  store = new GameStore(dir);
  await store.load();
  game = new Game(store);
  const scout = { id: 'scout', type: 'token', rev: 0, x: 50, y: 250, actor: 'goblin', linked: false };
  store.applyOps([
    { op: 'create', coll: 'main/tokens', doc: { ...scout, delta: { ownership: { default: 'limited', bo: 'owner' } } } },
  ]);
});

afterEach(async () => {
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  return ws;
}

const ops = (ws: FakeSocket, ...list: Op[]) => ws.receive({ t: 'ops', txn: 't', ops: list });
const reasons = (ws: FakeSocket) => ws.take('reject').map((r) => r.reason);
const update = (coll: string, id: string, patch: Record<string, unknown>): Op => ({ op: 'update', coll, id, patch });

describe('the ops message for players', () => {
  it('lets a trusted player edit what they own, as one undo step', () => {
    const ana = seat('ana');
    ops(ana, update('actors', 'hero', { name: 'Ana the Bold', hp: 7 }));
    expect(reasons(ana)).toEqual([]);
    expect(store.tokens.get('hero')).toMatchObject({ name: 'Ana the Bold', hp: 7 });
    ana.receive({ t: 'undo' });
    expect(store.tokens.get('hero')!.name).toBe('Hero');
  });

  it("refuses what they don't own, and all of the transaction with it", () => {
    const ana = seat('ana');
    ops(ana, update('actors', 'hero', { hp: 7 }), update('actors', 'goblin', { hp: 1 }));
    expect(reasons(ana)).toEqual(["You can't edit Goblin"]);
    expect(store.tokens.get('hero')!.hp).toBeUndefined();
  });

  it('keeps ownership, position and hiding for the GM', () => {
    const ana = seat('ana');
    ops(ana, update('actors', 'hero', { ownership: { default: 'owner' } }));
    ops(ana, update('main/tokens', 'hero', { x: 9999 }));
    expect(reasons(ana)).toEqual(['Only the GM can change ownership', 'Only the GM can change x']);
  });

  it("looks inside an unlinked copy's delta", () => {
    const bo = seat('bo');
    const ana = seat('ana');
    ops(
      bo,
      update('main/tokens', 'scout', {
        delta: { ownership: { default: 'limited', bo: 'owner' }, hotbar: ['scimitar'] },
      }),
    );
    expect(reasons(bo)).toEqual([]);
    expect(store.tokens.get('scout')!.hotbar).toEqual(['scimitar']);
    ops(bo, update('main/tokens', 'scout', { delta: { ownership: { default: 'owner' } } }));
    expect(reasons(bo)).toEqual(['Only the GM can change ownership']);
    ops(ana, update('main/tokens', 'scout', { delta: { ownership: { default: 'limited', bo: 'owner' }, hp: 1 } }));
    expect(reasons(ana)).toEqual(["You can't edit Goblin"]);
  });

  it('lets a plain player arrange the action bar of what they own, not edit its sheet', () => {
    const bo = seat('bo');
    ops(bo, update('main/tokens', 'scout', { delta: { ownership: { default: 'limited', bo: 'owner' }, hp: 1 } }));
    expect(reasons(bo)).toEqual(["You can't edit Goblin"]);
  });

  it('leaves adding and removing documents, the map and the game settings to the GM', () => {
    const ana = seat('ana');
    ops(ana, { op: 'delete', coll: 'main/tokens', id: 'hero' });
    ops(ana, { op: 'create', coll: 'main/walls', doc: { id: 'w9', type: 'wall', rev: 0, a: [0, 0], b: [1, 1] } });
    ops(ana, update('main/walls', 'door', { door: 'open' }));
    ops(ana, update('game', 'test', { name: 'Mine' }));
    expect(reasons(ana)).toEqual([
      'Only the GM can remove Hero',
      'Only the GM can add w9',
      "You can't edit door",
      "You can't edit Test",
    ]);
  });

  it('refuses an observer seat everything', () => {
    const cy = seat('cy');
    ops(cy, update('actors', 'hero', { hotbar: ['x'] }));
    expect(reasons(cy)).toEqual(["You can't edit Hero"]);
  });
});

describe('undo for players', () => {
  it('is refused once the GM has taken the creature away', () => {
    const gm = seat('gm');
    const bo = seat('bo');
    ops(
      bo,
      update('main/tokens', 'scout', {
        delta: { ownership: { default: 'limited', bo: 'owner' }, hotbar: ['scimitar'] },
      }),
    );
    ops(gm, update('main/tokens', 'scout', { delta: { hotbar: ['scimitar'] } }));
    gm.take('reject');
    bo.receive({ t: 'undo' });
    expect(bo.take('error').map((e) => e.message)).toEqual(["You can't undo the edit any more"]);
    expect(store.tokens.get('scout')!.hotbar).toEqual(['scimitar']);
  });
});

describe('documents sent to players', () => {
  const ids = (docs: Record<string, { id: string }[]> | undefined) =>
    Object.entries(docs ?? {}).flatMap(([coll, list]) => list.map((d) => `${coll}:${d.id}`));

  it('welcome a player with the documents they observe, and nothing else', () => {
    expect(ids(seat('ana').take('welcome')[0]!.docs).sort((a, b) => a.localeCompare(b))).toEqual([
      'actors:hero',
      'main/tokens:hero',
    ]);
    expect(ids(seat('bo').take('welcome')[0]!.docs)).toEqual(['main/tokens:scout']);
    expect(ids(seat('cy').take('welcome')[0]!.docs).sort((a, b) => a.localeCompare(b))).toEqual(
      ['actors:hero', 'main/tokens:hero', 'main/tokens:scout'].sort((a, b) => a.localeCompare(b)),
    );
  });

  it('send changes to those who observe them, and take documents away when that ends', () => {
    const gm = seat('gm');
    const ana = seat('ana');
    ana.take('welcome');
    ops(gm, update('actors', 'goblin', { hp: 3 }));
    expect(ana.take('docs')).toEqual([]);
    ops(gm, update('actors', 'goblin', { ownership: { default: 'limited', ana: 'observer' } }));
    const shown = ana.take('docs').flatMap((m) => m.changes.map((c) => `${c.coll}:${c.id}:${c.doc ? 'doc' : 'gone'}`));
    expect(shown).toEqual(['actors:goblin:doc', 'main/tokens:goblin:doc']);
    ops(gm, update('actors', 'goblin', { ownership: null }));
    const gone = ana.take('docs').flatMap((m) => m.changes.map((c) => `${c.coll}:${c.id}:${c.doc ? 'doc' : 'gone'}`));
    expect(gone).toEqual(['actors:goblin:gone', 'main/tokens:goblin:gone']);
  });

  it('hide hidden tokens from their owners too, like the map does', () => {
    const gm = seat('gm');
    const ana = seat('ana');
    ana.take('welcome');
    ops(gm, update('main/tokens', 'hero', { hidden: true }));
    const changes = ana
      .take('docs')
      .flatMap((m) => m.changes.map((c) => `${c.coll}:${c.id}:${c.doc ? 'doc' : 'gone'}`));
    expect(changes).toEqual(['main/tokens:hero:gone']);
  });
});
