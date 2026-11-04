import type { Doc } from '@vtt/core';
import type { ServerMessage } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from './session.ts';
import { closeSession, openSession, welcome, type FakeWebSocket } from './session.fixtures.ts';

// The adventure book a player opens with J (session-book.ts, `session.book`).

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
});

afterEach(() => closeSession(session));

const entry = (id: string, fields: Record<string, unknown> = {}): Doc => ({
  id,
  type: 'journal',
  rev: 1,
  name: id,
  pages: [],
  ...fields,
});

function join(role: 'gm' | 'player', journals: Doc[] = []): string {
  const base = welcome([]) as Extract<ServerMessage, { t: 'welcome' }>;
  const you = role === 'gm' ? { id: 'gm', name: 'GM', role, color: '#fc0' } : base.you;
  ws.receive({ ...base, you, docs: { journals } });
  return you.id;
}

const last = () => ws.sent.at(-1) as Record<string, unknown>;

describe('the adventure book', () => {
  it('opens on a tab, turns to another, and closes; J toggles it', () => {
    join('player');
    expect(session.book.tab).toBeUndefined();
    session.book.toggle();
    expect(session.book.tab).toBe('quests');
    session.book.open('map');
    expect(session.book.tab).toBe('map');
    session.book.toggle();
    expect(session.book.tab).toBeUndefined();
    session.book.toggle();
    expect(session.book.tab).toBe('map');
  });

  it('lists the entries under a tab', () => {
    join('player', [entry('q', { quest: { status: 'active', objectives: [] } }), entry('m', { book: 'map' })]);
    expect(session.book.entries('quests').map((d) => d.id)).toEqual(['q']);
    expect(session.book.entries('map').map((d) => d.id)).toEqual(['m']);
  });

  it('lets a player write a note of their own, opened to fill in, and share it', () => {
    const me = join('player');
    session.book.writeNote();
    expect(last()).toMatchObject({
      ops: [{ op: 'create', coll: 'journals', doc: { name: 'New note', book: 'log', author: me } }],
    });
    const id = (last().ops as { doc: Doc }[])[0]!.doc.id;
    expect(session.book.selected).toBe(id);
    expect(session.book.tab).toBe('log');
    expect(session.book.canWrite(id)).toBe(true);
    session.book.share(id, true);
    expect(last()).toMatchObject({
      ops: [{ op: 'update', coll: 'journals', id, patch: { ownership: { default: 'observer' } } }],
    });
    session.book.deleteNote(id);
    expect(last()).toMatchObject({ ops: [{ op: 'delete', coll: 'journals', id }] });
    expect(session.book.selected).toBeUndefined();
  });

  it('lets a player write only their own notes, and the GM any entry', () => {
    join('player', [entry('theirs', { author: 'bo' }), entry('lore')]);
    expect(session.book.canWrite('theirs')).toBe(false);
    expect(session.book.canWrite('lore')).toBe(false);
    closeSession(session);
    ({ session, ws } = openSession());
    join('gm', [entry('lore')]);
    expect(session.book.canWrite('lore')).toBe(true);
    session.book.writeNote();
    expect((last().ops as { doc: Doc }[])[0]?.doc.author).toBeUndefined();
  });
});
