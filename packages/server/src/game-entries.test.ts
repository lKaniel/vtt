import type { Doc, Op } from '@vtt/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// Rolling on roll tables and showing journal entries to players.

let store: GameStore;
let game: Game;
let roll = 0;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  roll = 0;
  game = new Game(store, { rng: () => roll });
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

const make = (coll: string, doc: Record<string, unknown>): Op => ({
  op: 'create',
  coll,
  doc: { rev: 0, ...doc } as Doc,
});

function setUp(gm: FakeSocket, extra: Record<string, unknown> = {}): void {
  const results = [{ text: 'Copper' }, { text: 'Silver', weight: 2 }, { text: 'Gold' }];
  gm.receive({
    t: 'ops',
    txn: 't',
    ops: [make('tables', { id: 'loot', type: 'rolltable', name: 'Loot', results, ...extra })],
  });
  gm.sent = [];
}

describe('roll tables', () => {
  it('roll into chat for everyone', () => {
    const gm = seat('gm');
    const ana = seat('ana');
    setUp(gm);
    roll = 0.5;
    gm.receive({ t: 'rollTable', table: 'loot' });
    const [card] = ana.take('chat');
    expect(card?.message.text).toBe('Loot: Silver (3 on 1d4)');
  });

  it('roll for the GM alone when asked', () => {
    const gm = seat('gm');
    const ana = seat('ana');
    setUp(gm);
    gm.receive({ t: 'rollTable', table: 'loot', gmOnly: true });
    expect(gm.take('chat')[0]?.message).toMatchObject({ gmOnly: true, text: 'Loot: Copper (1 on 1d4)' });
    expect(ana.take('chat')).toEqual([]);
  });

  it('mark what was drawn on a table without replacement, as one undo step, and say when it is empty', () => {
    const gm = seat('gm');
    setUp(gm, { replacement: false, results: [{ text: 'Map' }] });
    gm.receive({ t: 'rollTable', table: 'loot' });
    expect(store.docs.get('tables', 'loot')!.results).toEqual([{ text: 'Map', drawn: true }]);
    gm.receive({ t: 'rollTable', table: 'loot' });
    expect(gm.take('error').map((e) => e.message)).toEqual(['Everything on Loot has been drawn: reset it first']);
    gm.receive({ t: 'undo' });
    expect(store.docs.get('tables', 'loot')!.results).toEqual([{ text: 'Map' }]);
  });

  it('let players roll only on tables shared with them', () => {
    const gm = seat('gm');
    const ana = seat('ana');
    setUp(gm);
    ana.receive({ t: 'rollTable', table: 'loot' });
    expect(ana.take('error').map((e) => e.message)).toEqual(['No such table']);
    gm.receive({
      t: 'ops',
      txn: 't',
      ops: [{ op: 'update', coll: 'tables', id: 'loot', patch: { ownership: { default: 'observer' } } }],
    });
    ana.receive({ t: 'rollTable', table: 'loot' });
    expect(ana.take('chat')).toHaveLength(1);
  });
});

describe('showing a journal entry', () => {
  it('shares it with the players and opens it on their screens', () => {
    const gm = seat('gm');
    gm.receive({
      t: 'ops',
      txn: 't',
      ops: [make('journals', { id: 'map', type: 'journal', name: 'Old map', pages: [{ id: 'p1', name: 'Map' }] })],
    });
    const ana = seat('ana');
    gm.receive({ t: 'showJournal', entry: 'map', page: 'p1' });
    expect(store.docs.get('journals', 'map')!.ownership).toEqual({ default: 'observer' });
    expect(ana.take('showJournal')).toEqual([{ t: 'showJournal', entry: 'map', page: 'p1' }]);
  });

  it('is the GM’s to do', () => {
    seat('gm').receive({
      t: 'ops',
      txn: 't',
      ops: [make('journals', { id: 'map', type: 'journal', name: 'Old map', pages: [] })],
    });
    const ana = seat('ana');
    ana.receive({ t: 'showJournal', entry: 'map' });
    expect(ana.take('error').map((e) => e.message)).toEqual(['Only the GM can show journal entries']);
  });
});
