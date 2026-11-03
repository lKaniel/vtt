import type { Doc } from '@vtt/core';
import type { ServerMessage } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from './session.ts';
import { closeSession, openSession, welcome, type FakeWebSocket } from './session.fixtures.ts';

// Folders in the session: the sidebar lists' folders, and the ops that make,
// rename, colour, move and delete them, and move documents into them.

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
});

afterEach(() => closeSession(session));

const folder = (id: string, extra: Record<string, unknown> = {}): Doc => ({
  id,
  type: 'folder',
  rev: 1,
  name: id,
  kind: 'journals',
  ...extra,
});
const entry: Doc = { id: 'sun', type: 'journal', rev: 1, name: 'Sun', pages: [] };

function joinAsGm(): void {
  const base = welcome([]) as Extract<ServerMessage, { t: 'welcome' }>;
  const you = { id: 'gm', name: 'GM', role: 'gm' as const, color: '#fc0' };
  ws.receive({
    ...base,
    you,
    docs: { folders: [folder('lore', { sort: 'a1' }), folder('foes', { kind: 'actors' })], journals: [entry] },
  });
}

const lastOps = () => (ws.sent.at(-1) as { ops: unknown[] }).ops;

describe('folders in the session', () => {
  beforeEach(joinAsGm);

  it('list the folders of one list', () => {
    expect(session.folders.of('journals').map((f) => f.id)).toEqual(['lore']);
  });

  it('make a folder, inside another when asked', () => {
    const id = session.folders.create('journals', 'Gods', 'lore');
    expect(id).toBe('gods');
    expect(lastOps()).toMatchObject([{ op: 'create', coll: 'folders', doc: { id: 'gods', parent: 'lore' } }]);
  });

  it('find a top-level folder by its name, or make it', () => {
    expect(session.folders.ensure('journals', 'lore')).toBe('lore');
    const sent = ws.sent.length;
    expect(session.folders.ensure('actors', 'Road')).toBe('road');
    expect(ws.sent).toHaveLength(sent + 1);
  });

  it('rename, colour and delete a folder', () => {
    session.folders.rename('lore', 'Old lore');
    expect(lastOps()).toMatchObject([{ op: 'update', coll: 'folders', id: 'lore', patch: { name: 'Old lore' } }]);
    session.folders.color('lore', '#336699');
    expect(lastOps()).toMatchObject([{ op: 'update', patch: { color: '#336699' } }]);
    session.folders.color('lore', undefined);
    expect(lastOps()).toMatchObject([{ op: 'update', patch: { color: null } }]);
    session.folders.remove('lore');
    expect(lastOps()).toEqual([{ op: 'delete', coll: 'folders', id: 'lore' }]);
  });

  it('move documents into a folder, and out to the top', () => {
    session.folders.move([{ coll: 'journals', id: 'sun' }], 'lore');
    expect(lastOps()).toMatchObject([{ op: 'update', coll: 'journals', id: 'sun', patch: { folder: 'lore' } }]);
    session.folders.move([{ coll: 'journals', id: 'sun' }], undefined);
    expect(lastOps()).toMatchObject([{ op: 'update', coll: 'journals', id: 'sun', patch: { folder: null } }]);
    const sent = ws.sent.length;
    session.folders.move([{ coll: 'journals', id: 'sun' }], undefined);
    // Nothing to do: it is at the top already.
    expect(ws.sent).toHaveLength(sent);
  });
});
