import type { Doc } from '@vtt/core';
import type { ServerMessage } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../session.ts';
import { exposeApi } from './script-api.ts';
import { closeSession, openSession, token, welcome, type FakeWebSocket } from '../session.fixtures.ts';

// The scripting API (docs/scripting.md): what a GM's script macro or a
// plugin sees as `vtt`. It acts through the session, so the server checks
// everything it does like any click.

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
});

afterEach(() => closeSession(session));

const last = () => ws.sent.at(-1) as Record<string, unknown>;
const heal: Doc = { id: 'heal', type: 'macro', rev: 1, name: 'Heal', kind: 'script', command: '' };

function joinAsGm(macros: Doc[] = []): void {
  const base = welcome([token('hero', 150, 250), token('goblin')]) as Extract<ServerMessage, { t: 'welcome' }>;
  ws.receive({ ...base, you: { id: 'gm', name: 'GM', role: 'gm', color: '#fc0' }, docs: { macros } });
}

describe('the scripting API', () => {
  it('tells who you are and what you see', () => {
    joinAsGm();
    const { vtt } = session.scripts;
    expect(vtt.user()).toMatchObject({ id: 'gm', role: 'gm' });
    expect(vtt.isGm()).toBe(true);
    expect(vtt.tokens().map((t) => t.id)).toEqual(['hero', 'goblin']);
    expect(vtt.token('goblin')?.x).toBe(50);
    session.select('hero');
    expect(vtt.selected()?.id).toBe('hero');
    expect(vtt.targets()).toEqual([]);
  });

  it('acts through the session: chat, moves, document edits and raw messages', () => {
    joinAsGm([heal]);
    const { vtt } = session.scripts;
    vtt.chat('/r 1d20');
    expect(last()).toEqual({ t: 'chat', text: '/r 1d20' });
    vtt.move('hero', 250, 250);
    expect(last()).toMatchObject({ t: 'move', token: 'hero', to: [250, 250] });
    vtt.edit([{ op: 'update', coll: 'macros', id: 'heal', patch: { name: 'Mend' } }], 'rename');
    expect(last()).toMatchObject({ t: 'ops', label: 'rename', ops: [{ op: 'update', id: 'heal' }] });
    expect(vtt.doc('macros', 'heal')?.name).toBe('Mend');
    expect(vtt.docs('macros')).toHaveLength(1);
    vtt.send({ t: 'endTurn' });
    expect(last()).toEqual({ t: 'endTurn' });
  });

  it('edits documents through the session in one undo step', () => {
    joinAsGm([heal]);
    session.changeDocs([{ op: 'delete', coll: 'macros', id: 'heal' }]);
    expect(last()).toMatchObject({ t: 'ops', label: 'script', ops: [{ op: 'delete', id: 'heal' }] });
    expect(session.docs.get('macros', 'heal')).toBeUndefined();
  });

  it('translates, and takes a plugin’s own words', () => {
    joinAsGm();
    const { i18n } = session.scripts.vtt;
    expect(i18n.lang()).toBe('en');
    expect(i18n.t('keys.title')).toBe('Keybindings');
    i18n.add('en', { 'alert.turn': "{name}'s turn" });
    expect(i18n.t('alert.turn', { name: 'Bram' })).toBe("Bram's turn");
  });

  it('shows a notice', () => {
    joinAsGm();
    session.scripts.vtt.notify('Done');
    expect(session.error).toMatchObject({ message: 'Done', info: true });
  });

  it('passes session news on as hooks', () => {
    joinAsGm();
    const said = vi.fn();
    session.scripts.vtt.hooks.on('chat', said);
    ws.receive({ t: 'chat', message: { id: 'm', from: 'GM', text: 'hi', time: 1, color: '#fc0' } });
    expect(said).toHaveBeenCalledWith(expect.objectContaining({ text: 'hi' }));
  });
});

describe('plugins', () => {
  it('load when the table welcomes you', async () => {
    const start = vi.fn();
    session.scripts.plugins.importModule = () => Promise.resolve({ default: start });
    const base = welcome([]) as Extract<ServerMessage, { t: 'welcome' }>;
    ws.receive({
      ...base,
      plugins: [{ id: 'alert', name: 'Alert', main: '/plugins/alert/main.js', styles: [], languages: [] }],
    });
    await vi.waitFor(() => expect(start).toHaveBeenCalledWith(session.scripts.vtt));
  });

  it('show their failure as an error', async () => {
    session.scripts.plugins.importModule = () => Promise.reject(new Error('404'));
    const base = welcome([]) as Extract<ServerMessage, { t: 'welcome' }>;
    ws.receive({
      ...base,
      plugins: [{ id: 'alert', name: 'Alert', main: '/plugins/alert/main.js', styles: [], languages: [] }],
    });
    await vi.waitFor(() => expect(session.error?.message).toBe('Plugin alert failed: 404'));
  });
});

describe('script macros', () => {
  it('run in the GM’s browser with vtt and the token, never on the server', async () => {
    joinAsGm([{ ...heal, command: 'vtt.chat("healing " + token)' }]);
    await session.journal.runMacro('heal', 'hero');
    expect(last()).toEqual({ t: 'chat', text: 'healing hero' });
    expect(ws.sent.some((m) => (m as { t: string }).t === 'runMacro')).toBe(false);
  });

  it('show their error instead of breaking the table', async () => {
    joinAsGm([{ ...heal, command: 'throw new Error("no potions")' }]);
    await session.journal.runMacro('heal');
    expect(session.error?.message).toBe('Heal: no potions');
  });

  it('can run another macro by name', async () => {
    joinAsGm([heal, { id: 'hail', type: 'macro', rev: 1, name: 'Hail', kind: 'chat', command: 'Hi' }]);
    await session.scripts.vtt.runMacro('Hail', 'hero');
    expect(last()).toEqual({ t: 'runMacro', macro: 'hail', token: 'hero' });
  });
});

describe('the page’s vtt', () => {
  it('is the open table’s API, gone when the table closes', () => {
    const page: Parameters<typeof exposeApi>[1] = {};
    const undo = exposeApi(session.scripts.vtt, page);
    expect(page.vtt).toBe(session.scripts.vtt);
    undo();
    expect(page.vtt).toBeUndefined();
  });
});
