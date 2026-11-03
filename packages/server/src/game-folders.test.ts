import type { Doc, Op } from '@vtt/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './store/game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// Folders in the sidebar lists: the GM's documents, seen by a player only
// when something in them is theirs to see, and emptied into their parent
// when deleted.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  game = new Game(store);
});

afterEach(async () => {
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  return ws;
}

const make = (coll: string, doc: Record<string, unknown>): Op => ({
  op: 'create',
  coll,
  doc: { rev: 0, ...doc } as Doc,
});
const folder = (id: string, extra: Record<string, unknown> = {}) =>
  make('folders', { id, type: 'folder', name: id, kind: 'journals', ...extra });
const entry = (id: string, extra: Record<string, unknown> = {}) =>
  make('journals', { id, type: 'journal', name: id, pages: [], ...extra });

function send(ws: FakeSocket, ops: Op[]): void {
  ws.receive({ t: 'ops', txn: 't', ops });
  expect(ws.take('reject')).toEqual([]);
}

const seen = (ws: FakeSocket) =>
  ws.take('docs').flatMap((m) => m.changes.map((c) => `${c.coll}:${c.id}:${c.doc ? 'doc' : 'gone'}`));

describe('folders', () => {
  it('are kept in folders/ like other sidebar documents', async () => {
    const gm = seat('gm');
    send(gm, [folder('lore', { color: '#336699' })]);
    await store.flush();
    expect(store.docs.get('folders', 'lore')).toMatchObject({ name: 'lore', kind: 'journals', color: '#336699' });
  });

  it('are only the GM’s to make', () => {
    const ana = seat('ana');
    ana.receive({ t: 'ops', txn: 't', ops: [folder('mine')] });
    expect(ana.take('reject')).toHaveLength(1);
  });

  it('reach a player once something in them, or in a folder below, is shared with them', () => {
    const gm = seat('gm');
    const ana = seat('ana');
    send(gm, [folder('lore'), folder('gods', { parent: 'lore' }), entry('sun', { folder: 'gods' })]);
    ana.take('docs');
    const welcomed = () => seat('ana').take('welcome')[0]!.docs ?? {};
    expect(welcomed().folders).toBeUndefined();
    send(gm, [{ op: 'update', coll: 'journals', id: 'sun', patch: { ownership: { default: 'observer' } } }]);
    expect(seen(ana).sort((a, b) => a.localeCompare(b))).toEqual([
      'folders:gods:doc',
      'folders:lore:doc',
      'journals:sun:doc',
    ]);
    expect(
      welcomed()
        .folders?.map((f) => f.id)
        .sort(),
    ).toEqual(['gods', 'lore']);
  });

  it('let what they held out into their parent when deleted, as one undo step', () => {
    const gm = seat('gm');
    send(gm, [folder('lore'), folder('gods', { parent: 'lore' }), folder('old', { parent: 'gods' })]);
    send(gm, [entry('sun', { folder: 'gods' })]);
    send(gm, [{ op: 'delete', coll: 'folders', id: 'gods' }]);
    expect(store.docs.get('journals', 'sun')!.folder).toBe('lore');
    expect(store.docs.get('folders', 'old')!.parent).toBe('lore');
    gm.receive({ t: 'undo' });
    expect(store.docs.get('folders', 'gods')).toBeDefined();
    expect(store.docs.get('journals', 'sun')!.folder).toBe('gods');
    expect(store.docs.get('folders', 'old')!.parent).toBe('gods');
  });

  it('hold scenes too', () => {
    const gm = seat('gm');
    send(gm, [folder('towns', { kind: 'scenes' })]);
    send(gm, [{ op: 'update', coll: 'scenes', id: 'main', patch: { folder: 'towns' } }]);
    expect(store.docs.get('scenes', 'main')!.folder).toBe('towns');
  });
});
