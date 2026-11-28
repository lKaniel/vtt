import type { ErrorEntry } from '@vtt/shared';
import type { ServerMessage } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from './session.ts';
import { closeSession, openSession, welcome, type FakeWebSocket } from './session.fixtures.ts';
import { errorCapture } from './error-capture.ts';

// The error log in the session: this browser's errors go to the server, and
// the GM keeps the game's log and how many errors came since they looked.

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
});

afterEach(() => closeSession(session));

function joinAs(role: 'gm' | 'player'): void {
  const base = welcome([]) as Extract<ServerMessage, { t: 'welcome' }>;
  ws.receive(role === 'gm' ? { ...base, you: { id: 'gm', name: 'GM', role, color: '#fc0' } } : base);
}

const entry = (id: string, last = 1): ErrorEntry => ({
  id,
  source: 'browser',
  message: id,
  at: 1,
  last,
  count: 1,
});

describe('errors in this browser', () => {
  it('go to the server once the game is joined', () => {
    errorCapture.report({ message: 'before joining', where: 'error on /' });
    expect(ws.sent).toEqual([]);
    joinAs('player');
    errorCapture.report({ message: 'after joining', where: 'error on /' });
    const reports = ws.sent.filter((m) => (m as { t: string }).t === 'reportError');
    expect(reports).toEqual([
      expect.objectContaining({ t: 'reportError', message: 'before joining', where: 'error on /' }),
      expect.objectContaining({ t: 'reportError', message: 'after joining' }),
    ]);
  });
});

describe('the GM’s error log', () => {
  it('holds the log the server sends, and each error after it', () => {
    joinAs('gm');
    ws.receive({ t: 'errors', entries: [entry('a')] });
    ws.receive({ t: 'errorLogged', entry: entry('b') });
    ws.receive({ t: 'errorLogged', entry: { ...entry('a', 5), count: 2 } });
    expect(session.errors.entries.map((e) => [e.id, e.count])).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
  });

  it('counts the errors that came since the GM last looked', () => {
    joinAs('gm');
    ws.receive({ t: 'errors', entries: [entry('a', 10)] });
    expect(session.errors.unseen).toBe(1);
    session.errors.seen();
    expect(session.errors.unseen).toBe(0);
    ws.receive({ t: 'errorLogged', entry: entry('b', 20) });
    expect(session.errors.unseen).toBe(1);
  });

  it('is cleared through the server', () => {
    joinAs('gm');
    ws.receive({ t: 'errors', entries: [entry('a')] });
    session.errors.clear();
    expect(ws.sent.at(-1)).toEqual({ t: 'clearErrors' });
    ws.receive({ t: 'errors', entries: [] });
    expect(session.errors.entries).toEqual([]);
  });

  it('reads as text, to paste somewhere', () => {
    joinAs('gm');
    ws.receive({
      t: 'errors',
      entries: [{ ...entry('boom'), player: 'Ana', where: 'move', stack: 'Error: boom\n at x', count: 3 }],
    });
    const text = session.errors.text();
    expect(text).toContain('boom');
    expect(text).toContain('Ana');
    expect(text).toContain('×3');
    expect(text).toContain('at x');
  });
});
