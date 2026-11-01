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
    ...(welcome([token('hero', 150, 150), token('orc', 450, 150)]) as Extract<ServerMessage, { t: 'welcome' }>),
    you: { id: 'gm', name: 'GM', role: 'gm', color: '#fc0' },
    docs: {
      'main/tokens': [doc('hero', 'token', { x: 150, y: 150 }), doc('orc', 'token', { x: 450, y: 150 })],
      'main/walls': [doc('w1', 'wall', { a: [0, 0], b: [200, 0] }), doc('w2', 'wall', { a: [0, 0], b: [0, 200] })],
      'main/lights': [doc('torch', 'light', { x: 100, y: 100, bright: 20, dim: 20 })],
    },
  };
}

interface Sent {
  t: string;
  txn?: string;
  label?: string;
  ops?: { op: string; coll: string; id?: string; rev?: number; patch?: Record<string, unknown> }[];
}
const lastOps = () => (ws.sent as Sent[]).filter((m) => m.t === 'ops').at(-1);

describe('editor modes', () => {
  it('starts on tokens; a mode change drops the selection and picks the select tool', () => {
    ws.receive(gmWelcome());
    expect(session.mode).toBe('tokens');
    session.setMode('walls', 'door');
    expect(session.tool).toBe('door');
    session.setSelection(['main/walls#w1']);
    session.setMode('lights');
    expect(session.tool).toBe('select');
    expect(session.selection).toEqual([]);
  });

  it('players stay on tokens', () => {
    ws.receive(welcome());
    session.setMode('walls');
    expect(session.mode).toBe('tokens');
  });
});

describe('selection', () => {
  it('selecting a token selects it in the tokens mode too, and back', () => {
    ws.receive(gmWelcome());
    session.select('hero');
    expect(session.selection).toEqual(['main/tokens#hero']);
    session.setSelection(['main/tokens#orc', 'main/tokens#hero']);
    expect(session.selected).toBe('hero');
    session.setSelection(['main/tokens#orc']);
    expect(session.selected).toBe('orc');
    session.setSelection([]);
    expect(session.selected).toBeUndefined();
  });

  it('select all takes everything in the mode', () => {
    ws.receive(gmWelcome());
    session.setMode('walls');
    session.selectAll();
    expect(session.selection).toEqual(['main/walls#w1', 'main/walls#w2']);
  });

  it('players select all of their own tokens only', () => {
    ws.receive(welcome([token('hero'), { ...token('orc'), ownership: { default: 'limited' } }]));
    session.selectAll();
    expect(session.selection).toEqual(['main/tokens#hero']);
  });

  it('a token that goes away leaves the selection', () => {
    ws.receive(gmWelcome());
    session.setSelection(['main/tokens#orc', 'main/tokens#hero']);
    ws.receive({ t: 'tokenGone', id: 'orc' });
    expect(session.selection).toEqual(['main/tokens#hero']);
  });

  it('deleted documents leave the selection', () => {
    ws.receive(gmWelcome());
    session.setMode('walls');
    session.selectAll();
    ws.receive({ t: 'docs', changes: [{ coll: 'main/walls', id: 'w1' }] });
    expect(session.selection).toEqual(['main/walls#w2']);
  });
});

describe('edits from the editor', () => {
  it('moves the selection by whole squares in one transaction', () => {
    ws.receive(gmWelcome());
    session.setMode('walls');
    session.selectAll();
    session.moveSelection(session.selection, [130, 20], false);
    expect(lastOps()).toMatchObject({
      label: 'move',
      ops: [
        { op: 'update', coll: 'main/walls', id: 'w1', rev: 1, patch: { a: [100, 0], b: [300, 0] } },
        { op: 'update', coll: 'main/walls', id: 'w2', rev: 1, patch: { a: [100, 0], b: [100, 200] } },
      ],
    });
  });

  it('does nothing for a move that snaps to nowhere', () => {
    ws.receive(gmWelcome());
    session.setMode('walls');
    session.selectAll();
    session.moveSelection(session.selection, [20, 20], false);
    expect(lastOps()).toBeUndefined();
  });

  it('shows an edit at once and takes it back when the server refuses it', () => {
    ws.receive(gmWelcome());
    session.setMode('lights');
    session.reshape('main/lights#torch', 'dim', [100, 1100], false);
    expect(session.docs.get('main/lights', 'torch')).toMatchObject({ dim: 30, rev: 2 });
    const txn = lastOps()!.txn!;
    ws.receive({ t: 'reject', txn, reason: 'No' });
    expect(session.docs.get('main/lights', 'torch')).toMatchObject({ dim: 20, rev: 1 });
  });

  it('a second edit before the echo is made against the revision the first one makes', () => {
    ws.receive(gmWelcome());
    session.setMode('lights');
    session.selectAll();
    session.nudge([1, 0], false);
    session.nudge([1, 0], false);
    expect(lastOps()?.ops?.[0]).toMatchObject({ rev: 2, patch: { x: 102 } });
  });

  it('keeps the server copy once the edit is confirmed', () => {
    ws.receive(gmWelcome());
    session.setMode('lights');
    session.reshape('main/lights#torch', 'bright', [500, 100], false);
    const txn = lastOps()!.txn!;
    const confirmed = doc('torch', 'light', { rev: 3, x: 100, y: 100, bright: 20, dim: 20 });
    ws.receive({ t: 'docs', txn, changes: [{ coll: 'main/lights', id: 'torch', doc: confirmed }] });
    ws.receive({ t: 'reject', txn, reason: 'late' });
    expect(session.docs.get('main/lights', 'torch')).toMatchObject({ rev: 3 });
  });

  it('nudges by a pixel, or a square with shift', () => {
    ws.receive(gmWelcome());
    session.setMode('lights');
    session.selectAll();
    session.nudge([1, 0], false);
    expect(lastOps()?.ops?.[0]?.patch).toEqual({ x: 101 });
    session.nudge([0, -1], true);
    expect(lastOps()?.ops?.[0]?.patch).toEqual({ y: 0 });
  });

  it('edits fields of the whole selection', () => {
    ws.receive(gmWelcome());
    session.setMode('walls');
    session.selectAll();
    session.editSelection({ door: 'closed', sight: null });
    expect(lastOps()).toMatchObject({ label: 'edit', ops: [{ patch: { door: 'closed', sight: null } }, { id: 'w2' }] });
  });

  it('delete and copy work on the selection of any mode', () => {
    ws.receive(gmWelcome());
    session.setMode('walls');
    session.setSelection(['main/walls#w2']);
    expect(JSON.parse(session.copy()!)).toMatchObject({ docs: [{ id: 'w2', type: 'wall' }] });
    session.deleteSelected();
    expect(lastOps()).toMatchObject({ label: 'delete', ops: [{ op: 'delete', coll: 'main/walls', id: 'w2' }] });
  });
});
