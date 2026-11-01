import type { Doc } from '@vtt/core';
import type { ServerMessage } from '@vtt/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from './session.ts';
import { closeSession, openSession, token, welcome, type FakeWebSocket } from './session.fixtures.ts';

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
});

afterEach(() => closeSession(session));

const doc = (id: string, type: string, extra: Record<string, unknown> = {}): Doc => ({ id, type, rev: 1, ...extra });

function gmWelcome(): ServerMessage {
  return {
    ...(welcome([token('hero', 150, 150)]) as Extract<ServerMessage, { t: 'welcome' }>),
    you: { id: 'gm', name: 'GM', role: 'gm', color: '#fc0' },
    scene: 'main',
    history: { undo: 'move' },
    docs: {
      actors: [doc('hero', 'actor', { name: 'Hero' })],
      'main/tokens': [doc('hero', 'token', { x: 150, y: 150, actor: 'hero', linked: true })],
    },
  };
}

interface Sent {
  t: string;
  label?: string;
  ops?: { op: string; coll: string; id?: string; doc?: Doc }[];
}
const sent = () => ws.sent as Sent[];
const lastOps = () =>
  sent()
    .filter((m) => m.t === 'ops')
    .at(-1);

describe('the document mirror', () => {
  it('starts from the welcome and follows docs messages', () => {
    ws.receive(gmWelcome());
    expect(session.docs.get('main/tokens', 'hero')).toMatchObject({ x: 150 });
    ws.receive({
      t: 'docs',
      changes: [
        { coll: 'main/tokens', id: 'hero', doc: doc('hero', 'token', { x: 250, y: 150 }) },
        { coll: 'actors', id: 'hero' },
      ],
    });
    expect(session.docs.get('main/tokens', 'hero')).toMatchObject({ x: 250 });
    expect(session.docs.all('actors')).toEqual([]);
    expect(session.scene).toBe('main');
  });

  it('is empty for players, who are sent views instead', () => {
    ws.receive(welcome());
    expect(session.docs.all('main/tokens')).toEqual([]);
  });
});

describe('edit commands', () => {
  it('copies the selected token and pastes it at the pointer as a new one', () => {
    ws.receive(gmWelcome());
    session.select('hero');
    const text = session.copy();
    expect(JSON.parse(text!)).toMatchObject({ type: 'vtt/documents' });
    session.pointer = [420, 380];
    session.paste(text);
    expect(lastOps()).toMatchObject({
      label: 'paste',
      ops: [{ op: 'create', coll: 'main/tokens', doc: { id: 'hero-1', x: 450, y: 350, actor: 'hero' } }],
    });
  });

  it('pastes what it copied last when the system clipboard holds something else', () => {
    ws.receive(gmWelcome());
    session.openSheet({ kind: 'actor', id: 'hero' });
    session.copy();
    session.paste('just some text');
    expect(lastOps()).toMatchObject({ ops: [{ op: 'create', coll: 'actors', doc: { id: 'hero-1' } }] });
  });

  it('cuts as one transaction', () => {
    ws.receive(gmWelcome());
    session.select('hero');
    expect(session.cut()).toBeDefined();
    expect(lastOps()).toMatchObject({ label: 'cut', ops: [{ op: 'delete', coll: 'main/tokens', id: 'hero' }] });
  });

  it('duplicates one square over, and deletes', () => {
    ws.receive(gmWelcome());
    session.select('hero');
    session.duplicate();
    expect(lastOps()).toMatchObject({ label: 'duplicate', ops: [{ doc: { id: 'hero-1', x: 250, y: 250 } }] });
    session.deleteSelected();
    expect(lastOps()).toMatchObject({ label: 'delete', ops: [{ op: 'delete', id: 'hero' }] });
  });

  it('does nothing without a selection, or for players', () => {
    ws.receive(gmWelcome());
    expect(session.copy()).toBeUndefined();
    session.duplicate();
    ws.receive(welcome());
    session.select('hero');
    expect(session.copy()).toBeUndefined();
    session.paste();
    expect(lastOps()).toBeUndefined();
  });

  it('shows why the server refused an edit', () => {
    ws.receive(gmWelcome());
    ws.receive({ t: 'reject', txn: 'x', reason: 'hero-1: x: expected number' });
    expect(session.error?.message).toBe('hero-1: x: expected number');
  });
});

describe('undo and redo', () => {
  it('asks the server, and shows what it undid', () => {
    ws.receive(gmWelcome());
    expect(session.history).toEqual({ undo: 'move' });
    session.undo();
    session.redo();
    session.undoCard('card-1');
    expect(sent().slice(-3)).toEqual([{ t: 'undo' }, { t: 'redo' }, { t: 'undo', card: 'card-1' }]);
    ws.receive({ t: 'history', redo: 'move' });
    expect(session.history).toEqual({ redo: 'move' });
    ws.receive({ t: 'undone', label: 'move', redo: false });
    expect(session.error).toMatchObject({ message: 'Undid the move', info: true });
    ws.receive({ t: 'undone', label: 'move', redo: true });
    expect(session.error?.message).toBe('Redid the move');
  });

  it('marks chat cards the GM undid', () => {
    ws.receive({
      ...(welcome() as Extract<ServerMessage, { t: 'welcome' }>),
      chat: [{ id: 'c1', time: 0, from: 'Combat', color: '#fff', text: 'Roll for initiative!' }],
    });
    ws.receive({ t: 'chatUndone', ids: ['c1'], undone: true });
    expect(session.chat[0]!.undone).toBe(true);
    ws.receive({ t: 'chatUndone', ids: ['c1'], undone: false });
    expect(session.chat[0]!.undone).toBeUndefined();
  });
});
