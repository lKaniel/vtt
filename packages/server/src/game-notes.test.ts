import type { Doc, Op } from '@vtt/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './store/game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// Players' own notes in the adventure book's party log: journal entries
// signed with their `author`, which they write, share and remove.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  game = new Game(store, { rng: () => 0 });
});

afterEach(async () => {
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  ws.sent = [];
  return ws;
}

const note = (doc: Record<string, unknown>): Op => ({
  op: 'create',
  coll: 'journals',
  doc: { rev: 0, type: 'journal', name: 'Notes', book: 'log', pages: [], ...doc } as unknown as Doc,
});
const update = (id: string, patch: Record<string, unknown>): Op => ({ op: 'update', coll: 'journals', id, patch });
const send = (ws: FakeSocket, ...ops: Op[]) => ws.receive({ t: 'ops', txn: 't', ops });
const rejected = (ws: FakeSocket) => ws.take('reject').map((r) => r.reason);
const sees = (ws: FakeSocket, id: string) =>
  ws.sent.some((m) => m.t === 'docs' && JSON.stringify(m).includes(`"${id}"`));

describe("players' notes", () => {
  it('are written by a player and kept to themselves until shared', () => {
    const ana = seat('ana');
    const bo = seat('bo');
    send(ana, note({ id: 'mine', author: 'ana' }));
    expect(rejected(ana)).toEqual([]);
    send(ana, update('mine', { pages: [{ id: 'p', name: 'Day 1', kind: 'text', text: 'We met a wolf.' }] }));
    expect(rejected(ana)).toEqual([]);
    expect(sees(bo, 'mine')).toBe(false);
    send(ana, update('mine', { ownership: { default: 'observer' } }));
    expect(sees(bo, 'mine')).toBe(true);
  });

  it('are changed and removed only by their author', () => {
    const ana = seat('ana');
    const bo = seat('bo');
    send(ana, note({ id: 'mine', author: 'ana', ownership: { default: 'observer' } }));
    send(bo, update('mine', { name: 'Ha' }));
    expect(rejected(bo)).toEqual(["You can't edit Notes"]);
    send(ana, { op: 'delete', coll: 'journals', id: 'mine' });
    expect(store.docs.get('journals', 'mine')).toBeUndefined();
  });

  it('are not made in someone else’s name, nor made quests or calendar notes', () => {
    const ana = seat('ana');
    send(ana, note({ id: 'x', author: 'bo' }));
    expect(rejected(ana)).toEqual(['Only the GM can add Notes']);
    send(ana, note({ id: 'q', author: 'ana', quest: { status: 'active', objectives: [] } }));
    expect(rejected(ana)).toEqual(['Only the GM can make quests and calendar notes']);
    send(ana, note({ id: 'mine', author: 'ana' }), update('mine', { date: 86400 }));
    expect(rejected(ana)).toEqual(['Only the GM can make quests and calendar notes']);
  });
});
