import type { Doc } from '@vtt/core';
import type { ServerMessage } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from './session.ts';
import { closeSession, openSession, token, welcome, type FakeWebSocket } from './session.fixtures.ts';

// Drawings, notes, templates, regions and sounds made with the shape tools,
// and what players may do with the drawings and templates they make.

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
});

afterEach(() => closeSession(session));

const scribble = (id: string, author?: string): Doc => ({
  id,
  type: 'drawing',
  rev: 1,
  shape: 'line',
  points: [
    [0, 0],
    [100, 0],
  ],
  ...(author ? { author } : {}),
});

function joinAs(role: 'gm' | 'player'): void {
  const base = welcome([]) as Extract<ServerMessage, { t: 'welcome' }>;
  const you = role === 'gm' ? { id: 'gm', name: 'GM', role, color: '#fc0' } : base.you;
  ws.receive({
    ...base,
    you,
    docs: { 'main/drawings': [scribble('mine', 'ana'), scribble('gms')], 'main/notes': [] },
  });
}

const lastOps = () =>
  (ws.sent as { t: string; label?: string; ops?: { op: string; doc?: Doc; id?: string }[] }[])
    .filter((m) => m.t === 'ops')
    .at(-1);

describe('shape tools in the session', () => {
  it('make a drawing in the style picked, select it, and sign it for a player', () => {
    joinAs('player');
    session.editor.setMode('drawings', 'rect');
    session.draw.setStyle({ stroke: '#00ff00' });
    session.draw.create({ mode: 'drawings', data: { shape: 'rect', x: 0, y: 0, w: 100, h: 100 } });
    expect(lastOps()).toMatchObject({
      label: 'draw',
      ops: [
        {
          op: 'create',
          doc: { id: 'drawing-1', type: 'drawing', shape: 'rect', stroke: '#00ff00', strokeWidth: 4, author: 'ana' },
        },
      ],
    });
    expect(session.editor.selection).toEqual(['main/drawings#drawing-1']);
  });

  it('give templates the colour of who placed them', () => {
    joinAs('player');
    session.draw.create({ mode: 'templates', data: { shape: 'circle', x: 0, y: 0, distance: 20 } });
    expect(lastOps()?.ops?.[0]?.doc).toMatchObject({ type: 'template', color: '#f00', author: 'ana' });
  });

  it('let players into the drawings and templates modes only, and delete or copy only what they drew', () => {
    joinAs('player');
    session.editor.setMode('notes');
    expect(session.editor.mode).toBe('tokens');
    session.editor.setMode('drawings');
    expect(session.editor.mode).toBe('drawings');
    session.editor.setSelection(['main/drawings#gms']);
    session.edits.deleteSelected();
    expect(lastOps()).toBeUndefined();
    expect(session.edits.copy()).toBeUndefined();
    session.editor.setSelection(['main/drawings#mine']);
    expect(session.edits.copy()).toBeDefined();
    session.edits.deleteSelected();
    expect(lastOps()).toMatchObject({ label: 'delete', ops: [{ op: 'delete', id: 'mine' }] });
  });

  it("paste a player's copy as their own", () => {
    joinAs('player');
    session.editor.setMode('drawings');
    session.editor.setSelection(['main/drawings#mine']);
    const text = session.edits.copy();
    session.edits.paste(text);
    expect(lastOps()).toMatchObject({
      label: 'paste',
      ops: [{ op: 'create', doc: { type: 'drawing', author: 'ana' } }],
    });
  });

  it('let the GM put notes down without signing them', () => {
    joinAs('gm');
    session.draw.create({ mode: 'notes', data: { x: 50, y: 50 } });
    const doc = lastOps()?.ops?.[0]?.doc;
    expect(doc).toMatchObject({ id: 'note-1', type: 'note', x: 50, y: 50 });
    expect(doc?.author).toBeUndefined();
  });

  it("show the level the GM picks, or the one the player's token stands on", () => {
    const levels = [
      { id: 'ground', name: 'Ground', bottom: 0 },
      { id: 'loft', name: 'Loft', bottom: 10 },
    ];
    const base = welcome([{ ...token('hero'), elevation: 12 }]) as Extract<ServerMessage, { t: 'welcome' }>;
    ws.receive({ ...base, world: { ...base.world, levels } });
    expect(session.levels.current).toBe('loft');
    ws.receive({ ...base, world: { ...base.world, levels }, you: { id: 'gm', name: 'GM', role: 'gm', color: '#fc0' } });
    expect(session.levels.current).toBeUndefined();
    session.levels.setView('ground');
    expect(session.levels.current).toBe('ground');
    ws.receive({ ...base });
    expect(session.levels.current).toBeUndefined();
  });

  it('let the inspector edit only what this seat may', () => {
    joinAs('player');
    session.editor.setMode('drawings');
    session.editor.setSelection(['main/drawings#gms']);
    expect(session.editor.canEditSelection()).toBe(false);
    session.editor.setSelection(['main/drawings#mine']);
    expect(session.editor.canEditSelection()).toBe(true);
    session.editor.editEach((doc) => ({ stroke: doc.id === 'mine' ? '#123456' : '#000000' }));
    expect(lastOps()).toMatchObject({ ops: [{ op: 'update', id: 'mine', patch: { stroke: '#123456' } }] });
  });
});
