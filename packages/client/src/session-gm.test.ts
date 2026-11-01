import type { ServerMessage } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from './session.ts';
import { dropOnOpenSheet } from './session-drops.ts';
import { closeSession, openSession, token, welcome, type FakeWebSocket } from './session.fixtures.ts';

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
});

afterEach(() => closeSession(session));

describe('the GM tools', () => {
  const gmWelcome = (): ServerMessage => ({
    ...(welcome() as Extract<ServerMessage, { t: 'welcome' }>),
    you: { id: 'gm', name: 'GM', role: 'gm', color: '#fc0' },
    players: [{ id: 'gm', name: 'GM', role: 'gm', color: '#fc0' }],
    actors: [{ ...token('bandit'), folder: 'Road' }],
  });

  it('keeps the Actors list up to date', () => {
    ws.receive(gmWelcome());
    expect([...session.actors.keys()]).toEqual(['bandit']);
    expect(session.players.map((p) => p.id)).toEqual(['gm']);
    ws.receive({ t: 'actor', actor: { ...token('wolf') } });
    ws.receive({ t: 'actorGone', id: 'bandit' });
    expect([...session.actors.keys()]).toEqual(['wolf']);
  });

  it('opens a sheet, switches it to editing, and closes it when the token goes', () => {
    ws.receive(gmWelcome());
    session.openSheet({ kind: 'token', id: 'hero' });
    expect(session.sheet).toEqual({ kind: 'token', id: 'hero', edit: false });
    session.setSheetEdit(true);
    expect(session.sheet?.edit).toBe(true);
    ws.receive({ t: 'tokenGone', id: 'hero' });
    expect(session.sheet).toBeUndefined();
  });

  it('only lets the GM, or a trusted owner, edit a sheet', () => {
    ws.receive(welcome());
    session.openSheet({ kind: 'token', id: 'hero' }, true);
    expect(session.sheet?.edit).toBe(false);
    const trusted = welcome([token('hero'), { ...token('goblin'), ownership: undefined }]);
    ws.receive({ ...trusted, you: { id: 'ana', name: 'Ana', role: 'trusted', color: '#f00' } } as ServerMessage);
    expect(session.canEdit('hero')).toBe(true);
    expect(session.canEdit('goblin')).toBe(false);
    session.openSheet({ kind: 'token', id: 'hero' }, true);
    expect(session.sheet?.edit).toBe(true);
    session.openSheet({ kind: 'actor', id: 'bandit' }, true);
    expect(session.sheet?.edit).toBe(false);
  });

  it('leaves edit mode when a new role no longer allows it', () => {
    const trusted = { ...welcome(), you: { id: 'ana', name: 'Ana', role: 'trusted', color: '#f00' } } as ServerMessage;
    ws.receive(trusted);
    session.openSheet({ kind: 'token', id: 'hero' }, true);
    ws.receive(welcome());
    expect(session.sheet).toEqual({ kind: 'token', id: 'hero', edit: false });
  });

  it('lets an observer seat watch but not act', () => {
    ws.receive({ ...welcome(), you: { id: 'ana', name: 'Ana', role: 'observer', color: '#f00' } } as ServerMessage);
    expect(session.canControl(session.tokens.get('hero')!)).toBe(false);
  });

  it("sends the GM's role changes", () => {
    ws.receive(gmWelcome());
    session.setRole('ana', 'trusted');
    expect(ws.sent.at(-1)).toEqual({ t: 'setRole', player: 'ana', role: 'trusted' });
  });

  it('saves a hotbar layout', () => {
    ws.receive(welcome());
    session.setHotbar('hero', ['spell:fire-bolt', null]);
    expect(ws.sent.at(-1)).toEqual({ t: 'hotbar', token: 'hero', slots: ['spell:fire-bolt', null] });
  });

  it('sends drops and shows why one was refused', () => {
    ws.receive(gmWelcome());
    session.spawnHidden = true;
    session.drop({ kind: 'monster', id: 'goblin', rules: '2014' }, [10, 10]);
    expect(ws.sent.at(-1)).toMatchObject({ t: 'spawn', hidden: true });
    session.drop({ kind: 'item', id: 'dagger' }, [900, 900]);
    expect(session.error?.message).toBe('Drop items on a creature');
  });

  it('sends what lands on the open sheet, with the part of it', () => {
    ws.receive(gmWelcome());
    dropOnOpenSheet(session, { kind: 'item', id: 'dagger' });
    expect(ws.sent.at(-1)).not.toMatchObject({ t: 'drop' });
    session.openSheet({ kind: 'token', id: 'hero' });
    dropOnOpenSheet(session, { kind: 'spell', id: 'fireball', rules: '2014' }, 'inventory');
    expect(ws.sent.at(-1)).toEqual({
      t: 'drop',
      what: { kind: 'spell', id: 'fireball', rules: '2014' },
      onto: { kind: 'token', id: 'hero' },
      area: 'inventory',
    });
    dropOnOpenSheet(session, { kind: 'monster', id: 'goblin', rules: '2014' });
    expect(session.error?.message).toBe('Drop creatures on the map');
    session.openSheet({ kind: 'actor', id: 'bandit' });
    dropOnOpenSheet(session, { kind: 'media', src: 'art/bandit.png' });
    expect(ws.sent.at(-1)).toMatchObject({ t: 'saveActor', actor: { id: 'bandit', img: 'art/bandit.png' } });
  });

  it('pins a journal entry dropped on the map as a note', () => {
    ws.receive(gmWelcome());
    session.drop({ kind: 'journal', id: 'lore', name: 'Lore' }, [40, 60]);
    expect(ws.sent.at(-1)).toMatchObject({
      t: 'ops',
      ops: [{ op: 'create', doc: { type: 'note', x: 40, y: 60, entry: 'lore', label: 'Lore' } }],
    });
  });
});

describe('the GM tools send', () => {
  it('edits, deletions, spawns and actors', () => {
    ws.receive(welcome());
    session.editToken('hero', {});
    session.editToken('hero', { hp: 3 });
    session.deleteToken('hero');
    session.setSpawnHidden(false);
    session.spawn({ kind: 'actor', id: 'bandit' }, [5, 5]);
    session.saveActor({ ...token('bandit') });
    session.deleteActor('bandit');
    session.relinkToken('hero', 'unlink');
    expect(ws.sent.slice(-6)).toEqual([
      { t: 'editToken', token: 'hero', patch: { hp: 3 } },
      { t: 'deleteToken', token: 'hero' },
      { t: 'spawn', from: { kind: 'actor', id: 'bandit' }, at: [5, 5], hidden: false },
      { t: 'saveActor', actor: token('bandit') },
      { t: 'deleteActor', actor: 'bandit' },
      { t: 'relinkToken', token: 'hero', how: 'unlink' },
    ]);
  });

  it('places things at the centre of the screen', () => {
    ws.receive(welcome());
    expect(session.viewCentre()).toEqual([0, 0]);
    session.viewRect = { x: 100, y: 200, w: 400, h: 200 };
    expect(session.viewCentre()).toEqual([300, 300]);
  });
});
