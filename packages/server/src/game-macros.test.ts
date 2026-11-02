import type { Doc, Op } from '@vtt/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// Chat macros: a list of chat lines saved as a document, run from the
// sidebar or the hotbar. The GM shares theirs; players keep their own.

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

const make = (doc: Record<string, unknown>): Op => ({
  op: 'create',
  coll: 'macros',
  doc: { rev: 0, type: 'macro', ...doc } as Doc,
});

const errors = (ws: FakeSocket) => ws.take('error').map((e) => e.message);
const rejected = (ws: FakeSocket) => ws.take('reject').map((r) => r.reason);

describe('chat macros', () => {
  it('post each line of the command to chat, rolls and all', () => {
    const gm = seat('gm');
    const ana = seat('ana');
    gm.receive({ t: 'ops', txn: 't', ops: [make({ id: 'hail', name: 'Hail', command: 'Well met!\n\n/r 1d20+2' })] });
    gm.receive({ t: 'runMacro', macro: 'hail' });
    const lines = ana.take('chat').map((c) => c.message);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ from: 'GM', text: 'Well met!' });
    expect(lines[1]?.roll?.total).toBeGreaterThanOrEqual(3);
  });

  it('speak as the token they are run for, when the player controls it', () => {
    const gm = seat('gm');
    const token = [...store.tokens.values()].find((t) => t.ownership?.ana === 'owner')!;
    gm.receive({
      t: 'ops',
      txn: 't',
      ops: [make({ id: 'hail', name: 'Hail', command: 'Hello', ownership: { default: 'observer' } })],
    });
    const ana = seat('ana');
    ana.receive({ t: 'runMacro', macro: 'hail', token: token.id });
    expect(ana.take('chat')[0]?.message.from).toBe(token.name);
  });

  it('are the GM’s alone until shared', () => {
    const gm = seat('gm');
    const ana = seat('ana');
    gm.receive({ t: 'ops', txn: 't', ops: [make({ id: 'hail', name: 'Hail', command: 'Hi' })] });
    expect(ana.sent.some((m) => m.t === 'docs' && JSON.stringify(m).includes('"hail"'))).toBe(false);
    ana.receive({ t: 'runMacro', macro: 'hail' });
    expect(errors(ana)).toEqual(['No such macro']);
  });

  it('can be made, changed and removed by a player, who keeps them to themselves', () => {
    const ana = seat('ana');
    const bo = seat('bo');
    ana.receive({ t: 'ops', txn: 't', ops: [make({ id: 'mine', name: 'Mine', command: 'Hi', author: 'ana' })] });
    expect(rejected(ana)).toEqual([]);
    ana.receive({ t: 'ops', txn: 't', ops: [{ op: 'update', coll: 'macros', id: 'mine', patch: { command: 'Yo' } }] });
    expect(store.docs.get('macros', 'mine')?.command).toBe('Yo');
    ana.receive({ t: 'runMacro', macro: 'mine' });
    expect(ana.take('chat')[0]?.message.text).toBe('Yo');
    bo.receive({ t: 'runMacro', macro: 'mine' });
    expect(errors(bo)).toEqual(['No such macro']);
    bo.receive({ t: 'ops', txn: 't', ops: [{ op: 'delete', coll: 'macros', id: 'mine' }] });
    expect(rejected(bo)).toEqual(["You can't edit Mine"]);
    ana.receive({ t: 'ops', txn: 't', ops: [{ op: 'delete', coll: 'macros', id: 'mine' }] });
    expect(store.docs.get('macros', 'mine')).toBeUndefined();
  });

  it('are not made by a player in someone else’s name', () => {
    const ana = seat('ana');
    ana.receive({ t: 'ops', txn: 't', ops: [make({ id: 'x', name: 'X', command: 'Hi', author: 'bo' })] });
    expect(rejected(ana)).toEqual(['Only the GM can add X']);
    expect(store.docs.get('macros', 'x')).toBeUndefined();
  });
});
