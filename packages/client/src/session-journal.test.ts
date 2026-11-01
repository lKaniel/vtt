import type { Doc } from '@vtt/core';
import type { ServerMessage } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from './session.ts';
import { closeSession, openSession, welcome, type FakeWebSocket } from './session.fixtures.ts';

// Journal entries, roll tables and playlists in the sidebar.

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
});

afterEach(() => closeSession(session));

const lore: Doc = {
  id: 'lore',
  type: 'journal',
  rev: 1,
  name: 'Lore',
  pages: [{ id: 'p1', name: 'Gods', kind: 'text' }],
};
const loot: Doc = {
  id: 'loot',
  type: 'rolltable',
  rev: 1,
  name: 'Loot',
  replacement: false,
  results: [{ text: 'Gold', drawn: true }],
};
const inn: Doc = {
  id: 'inn',
  type: 'playlist',
  rev: 1,
  name: 'Inn',
  mode: 'sequence',
  tracks: [
    { id: 'lute', name: 'Lute', src: 'lute.ogg' },
    { id: 'harp', name: 'Harp', src: 'harp.ogg' },
  ],
};

function joinAs(role: 'gm' | 'player'): void {
  const base = welcome([]) as Extract<ServerMessage, { t: 'welcome' }>;
  const you = role === 'gm' ? { id: 'gm', name: 'GM', role, color: '#fc0' } : base.you;
  ws.receive({ ...base, you, docs: { journals: [lore], tables: [loot], playlists: [inn] } });
}

const last = () => ws.sent.at(-1) as Record<string, unknown>;

describe('the sidebar documents in the session', () => {
  it('open a journal entry, and when the GM shows one', () => {
    joinAs('player');
    session.openJournal('lore');
    expect(session.journal).toEqual({ entry: 'lore' });
    session.closeJournal();
    expect(session.journal).toBeUndefined();
    ws.receive({ t: 'showJournal', entry: 'lore', page: 'p1' });
    expect(session.journal).toEqual({ entry: 'lore', page: 'p1' });
  });

  it('let the GM show an entry, and roll on a table', () => {
    joinAs('gm');
    session.showJournal('lore', 'p1');
    expect(last()).toEqual({ t: 'showJournal', entry: 'lore', page: 'p1' });
    session.rollTable('loot', true);
    expect(last()).toEqual({ t: 'rollTable', table: 'loot', gmOnly: true });
  });

  it('put drawn results back in a table', () => {
    joinAs('gm');
    session.resetTable('loot');
    expect(last()).toMatchObject({
      t: 'ops',
      label: 'table reset',
      ops: [{ op: 'update', patch: { results: [{ text: 'Gold' }] } }],
    });
  });

  it('start a playlist, play a track and stop', () => {
    joinAs('gm');
    session.playPlaylist('inn');
    expect(last()).toMatchObject({ ops: [{ patch: { tracks: [{ id: 'lute', playing: true }, { id: 'harp' }] } }] });
    session.playPlaylist('inn', 'harp');
    expect(last()).toMatchObject({ ops: [{ patch: { tracks: [{ id: 'lute' }, { id: 'harp', playing: true }] } }] });
    session.stopPlaylist('inn');
    expect(last()).toMatchObject({ label: 'stop music' });
  });

  it('make new entries, tables and playlists for the GM', () => {
    joinAs('gm');
    session.createEntry('journal');
    expect(last()).toMatchObject({
      ops: [{ op: 'create', coll: 'journals', doc: { id: 'journal-1', name: 'New entry', pages: [] } }],
    });
    session.createEntry('rolltable');
    expect(last()).toMatchObject({
      ops: [{ op: 'create', coll: 'tables', doc: { results: [{ text: 'Something' }] } }],
    });
    session.createEntry('playlist');
    expect(last()).toMatchObject({ ops: [{ op: 'create', coll: 'playlists', doc: { tracks: [] } }] });
  });
});
