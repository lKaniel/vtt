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

  it('opens a picture the GM shows, and the GM shows one', () => {
    ws.receive(welcome());
    ws.receive({ t: 'showImage', src: '/assets/map.png', title: 'Old map' });
    expect(session.shownImage).toEqual({ src: '/assets/map.png', title: 'Old map' });
    session.closeImage();
    expect(session.shownImage).toBeUndefined();
    session.showImage('/assets/map.png');
    expect(ws.sent.at(-1)).toEqual({ t: 'showImage', src: '/assets/map.png' });
  });

  it('sets your colour and picture', () => {
    ws.receive(welcome());
    session.setProfile({ color: '#3366ff', avatar: null });
    expect(ws.sent.at(-1)).toEqual({ t: 'profile', color: '#3366ff', avatar: null });
  });
});

describe('macros in the session', () => {
  const hail: Doc = { id: 'hail', type: 'macro', rev: 1, name: 'Hail', kind: 'chat', command: 'Hi', img: 'h.webp' };

  function joinWith(role: 'gm' | 'player', macros: Doc[]): string {
    const base = welcome([]) as Extract<ServerMessage, { t: 'welcome' }>;
    const you = role === 'gm' ? { id: 'gm', name: 'GM', role, color: '#fc0' } : base.you;
    ws.receive({ ...base, you, docs: { macros } });
    return you.id;
  }

  it('make a player’s macro signed as theirs, and the GM’s unsigned', () => {
    const me = joinWith('player', []);
    session.createEntry('macro');
    expect(last()).toMatchObject({ ops: [{ op: 'create', coll: 'macros', doc: { kind: 'chat', author: me } }] });
    closeSession(session);
    ({ session, ws } = openSession());
    joinWith('gm', []);
    session.createEntry('macro');
    expect((last().ops as { doc: Doc }[])[0]?.doc.author).toBeUndefined();
  });

  it('run a macro for a token, and show it on the hotbar', () => {
    joinWith('player', [hail]);
    session.runMacro('hail', 'bram');
    expect(last()).toEqual({ t: 'runMacro', macro: 'hail', token: 'bram' });
    expect(session.macroOf('hail')).toEqual({ id: 'hail', name: 'Hail', command: 'Hi', img: 'h.webp' });
    expect(session.macroOf('gone')).toBeUndefined();
  });

  it('let a player change and remove only their own', () => {
    const me = joinWith('player', [hail, { ...hail, id: 'mine', author: 'x' }]);
    expect(session.canEditMacro('hail')).toBe(false);
    ws.receive({ t: 'docs', changes: [{ coll: 'macros', id: 'own', doc: { ...hail, id: 'own', author: me } }] });
    expect(session.canEditMacro('own')).toBe(true);
    session.deleteMacro('own');
    expect(last()).toMatchObject({ ops: [{ op: 'delete', coll: 'macros', id: 'own' }] });
  });
});
