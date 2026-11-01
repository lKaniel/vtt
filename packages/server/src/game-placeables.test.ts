import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Doc, Op } from '@vtt/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './game-store.ts';
import { FakeSocket, makeTwoScenes } from './test/fixtures.ts';

// Drawings, notes, templates, regions and sounds on a scene, and journal
// entries, roll tables and playlists in the sidebar: saved in their files,
// drawn and placed by players where the rules let them, and sent to each
// player only as far as they may know of them.

let dir: string;
let store: GameStore;
let game: Game;

beforeEach(async () => {
  dir = await makeTwoScenes();
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
  return ws;
}

const make = (coll: string, doc: Record<string, unknown>): Op => ({
  op: 'create',
  coll,
  doc: { rev: 0, ...doc } as Doc,
});
const ops = (ws: FakeSocket, ...list: Op[]) => ws.receive({ t: 'ops', txn: 't', ops: list });
const reasons = (ws: FakeSocket) => ws.take('reject').map((r) => r.reason);
const scribble = (id: string, author?: string) =>
  make('main/drawings', {
    id,
    type: 'drawing',
    shape: 'line',
    points: [
      [0, 0],
      [100, 100],
    ],
    ...(author ? { author } : {}),
  });

/** The documents a client was sent in its welcome, by collection. */
function welcomed(ws: FakeSocket): Record<string, Doc[]> {
  return ws.take('welcome')[0]?.docs ?? {};
}

const ids = (docs: Doc[] | undefined) => (docs ?? []).map((d) => d.id).sort((a, b) => a.localeCompare(b));

describe('scene placeables and sidebar documents', () => {
  it('are saved in their own files', async () => {
    const gm = seat('gm');
    ops(
      gm,
      scribble('arrow'),
      make('main/notes', { id: 'pin', type: 'note', x: 50, y: 50, entry: 'lore' }),
      make('journals', { id: 'lore', type: 'journal', name: 'Lore', pages: [{ id: 'p1', name: 'Gods' }] }),
      make('tables', { id: 'loot', type: 'rolltable', name: 'Loot', results: [{ text: 'Gold' }] }),
    );
    expect(reasons(gm)).toEqual([]);
    await store.flush();
    const read = async (rel: string) => JSON.parse(await readFile(join(dir, rel), 'utf8')) as unknown;
    expect(await read('scenes/main/drawings.json')).toMatchObject([{ id: 'arrow', shape: 'line' }]);
    expect(await read('scenes/main/notes.json')).toEqual([{ id: 'pin', x: 50, y: 50, entry: 'lore' }]);
    expect(await read('journals/lore.json')).toEqual({
      id: 'lore',
      name: 'Lore',
      pages: [{ id: 'p1', name: 'Gods', kind: 'text' }],
    });
    expect(await read('tables/loot.json')).toMatchObject({ results: [{ text: 'Gold' }] });
  });

  it('refuse a document its file would not take', () => {
    const gm = seat('gm');
    ops(gm, make('main/regions', { id: 'bad', type: 'region', points: [[0, 0]] }));
    expect(reasons(gm)[0]).toMatch(/^bad: points/);
  });

  it('let players draw, and change or rub out only their own drawings', () => {
    const ana = seat('ana');
    const bo = seat('bo');
    ops(ana, scribble('ana-arrow', 'ana'));
    expect(reasons(ana)).toEqual([]);
    ops(ana, { op: 'update', coll: 'main/drawings', id: 'ana-arrow', patch: { stroke: '#ff0000' } });
    expect(reasons(ana)).toEqual([]);
    ops(bo, { op: 'delete', coll: 'main/drawings', id: 'ana-arrow' });
    expect(reasons(bo)).toEqual(["You can't edit ana-arrow"]);
    ops(bo, scribble('forged', 'ana'));
    expect(reasons(bo)).toEqual(['Only the GM can add forged']);
    ops(ana, { op: 'update', coll: 'main/drawings', id: 'ana-arrow', patch: { author: 'bo' } });
    expect(reasons(ana)).toEqual(['Only the GM can change author']);
    ops(ana, { op: 'delete', coll: 'main/drawings', id: 'ana-arrow' });
    expect(reasons(ana)).toEqual([]);
    expect(store.docs.get('main/drawings', 'ana-arrow')).toBeUndefined();
  });

  it('let players place templates of their own, but not notes or regions', () => {
    const ana = seat('ana');
    ops(
      ana,
      make('main/templates', {
        id: 'burst',
        type: 'template',
        shape: 'circle',
        x: 0,
        y: 0,
        distance: 20,
        author: 'ana',
      }),
    );
    expect(reasons(ana)).toEqual([]);
    ops(ana, make('main/notes', { id: 'pin', type: 'note', x: 0, y: 0, author: 'ana' }));
    expect(reasons(ana)).toEqual(['Only the GM can add pin']);
  });

  it("send players what they may know of: their scene's visible things, entries shared with them", () => {
    const gm = seat('gm');
    ops(
      gm,
      scribble('shown'),
      { ...scribble('secret'), doc: { ...(scribble('secret') as { doc: Doc }).doc, hidden: true } } as Op,
      make('cellar/drawings', { id: 'downstairs', type: 'drawing', shape: 'rect', x: 0, y: 0, w: 10, h: 10 }),
      make('main/notes', { id: 'inn-pin', type: 'note', x: 0, y: 0, entry: 'inn' }),
      make('main/notes', { id: 'lore-pin', type: 'note', x: 0, y: 0, entry: 'lore' }),
      make('main/regions', {
        id: 'trap',
        type: 'region',
        points: [
          [0, 0],
          [9, 0],
          [0, 9],
        ],
        behaviors: [],
      }),
      make('main/regions', {
        id: 'bog',
        type: 'region',
        visible: true,
        points: [
          [0, 0],
          [9, 0],
          [0, 9],
        ],
        behaviors: [{ type: 'difficult' }],
      }),
      make('main/sounds', { id: 'brook', type: 'sound', x: 0, y: 0, radius: 30, src: 'brook.ogg' }),
      make('journals', { id: 'inn', type: 'journal', name: 'The inn', ownership: { default: 'observer' }, pages: [] }),
      make('journals', { id: 'lore', type: 'journal', name: 'Lore', pages: [{ id: 'p', name: 'Secrets' }] }),
      make('journals', {
        id: 'rumours',
        type: 'journal',
        name: 'Rumours',
        ownership: { default: 'limited' },
        pages: [{ id: 'p', name: 'The duke', text: 'is a vampire' }],
      }),
    );
    expect(reasons(gm)).toEqual([]);
    const docs = welcomed(seat('ana'));
    expect(ids(docs['main/drawings'])).toEqual(['shown']);
    expect(docs['cellar/drawings']).toBeUndefined();
    expect(ids(docs['main/notes'])).toEqual(['inn-pin']);
    expect(ids(docs['main/regions'])).toEqual(['bog']);
    expect(ids(docs['main/sounds'])).toEqual(['brook']);
    expect(ids(docs.journals)).toEqual(['inn', 'rumours']);
    // Limited: the title, not the pages.
    expect(docs.journals!.find((j) => j.id === 'rumours')).toMatchObject({ name: 'Rumours', pages: [] });
  });

  it('send a note when the GM shares its entry, and take it back when it is hidden', () => {
    const gm = seat('gm');
    ops(
      gm,
      make('journals', { id: 'lore', type: 'journal', name: 'Lore', pages: [] }),
      make('main/notes', { id: 'pin', type: 'note', x: 0, y: 0, entry: 'lore' }),
    );
    const ana = seat('ana');
    ana.sent = [];
    ops(gm, { op: 'update', coll: 'journals', id: 'lore', patch: { ownership: { default: 'observer' } } });
    const sent = ana.take('docs').flatMap((m) => m.changes);
    expect(sent.map((c) => `${c.coll}#${c.id}`).sort((a, b) => a.localeCompare(b))).toEqual([
      'journals#lore',
      'main/notes#pin',
    ]);
    ops(gm, { op: 'update', coll: 'main/notes', id: 'pin', patch: { hidden: true } });
    expect(ana.take('docs').flatMap((m) => m.changes)).toEqual([{ coll: 'main/notes', id: 'pin' }]);
  });

  it('send players the playlists that are playing', () => {
    const gm = seat('gm');
    const tracks = [{ id: 'lute', name: 'Lute', src: 'lute.ogg' }];
    ops(gm, make('playlists', { id: 'tavern', type: 'playlist', name: 'Tavern', tracks }));
    const ana = seat('ana');
    expect(welcomed(ana).playlists).toBeUndefined();
    ops(gm, { op: 'update', coll: 'playlists', id: 'tavern', patch: { tracks: [{ ...tracks[0], playing: true }] } });
    expect(ana.take('docs').flatMap((m) => m.changes)).toMatchObject([{ coll: 'playlists', id: 'tavern' }]);
  });
});
