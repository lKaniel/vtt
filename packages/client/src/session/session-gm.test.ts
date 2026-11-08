import type { ServerMessage } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from './session.ts';
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
    session.sheets.open({ kind: 'token', id: 'hero' });
    expect(session.sheets.current).toEqual({ kind: 'token', id: 'hero', edit: false });
    session.sheets.setEdit(true);
    expect(session.sheets.current?.edit).toBe(true);
    ws.receive({ t: 'tokenGone', id: 'hero' });
    expect(session.sheets.current).toBeUndefined();
  });

  it('only lets the GM, or an owner, edit a sheet', () => {
    ws.receive({ ...welcome(), you: { id: 'ana', name: 'Ana', role: 'observer', color: '#f00' } } as ServerMessage);
    session.sheets.open({ kind: 'token', id: 'hero' }, true);
    expect(session.sheets.current?.edit).toBe(false);
    ws.receive(welcome([token('hero'), { ...token('goblin'), ownership: undefined }]));
    expect(session.canEdit('hero')).toBe(true);
    expect(session.canEdit('goblin')).toBe(false);
    session.sheets.open({ kind: 'token', id: 'hero' }, true);
    expect(session.sheets.current?.edit).toBe(true);
    session.sheets.open({ kind: 'actor', id: 'bandit' }, true);
    expect(session.sheets.current?.edit).toBe(false);
  });

  it('lets a player edit the sheet of the actor they own, from the Actors tab', () => {
    const mine = { ...token('mira'), ownership: { default: 'none' as const, ana: 'owner' as const } };
    ws.receive({ ...welcome(), actors: [mine, { ...token('bandit'), ownership: undefined }] } as ServerMessage);
    session.sheets.open({ kind: 'actor', id: 'mira' }, true);
    expect(session.sheets.current?.edit).toBe(true);
    session.sheets.open({ kind: 'actor', id: 'bandit' }, true);
    expect(session.sheets.current?.edit).toBe(false);
  });

  it('leaves edit mode when a new role no longer allows it', () => {
    ws.receive(welcome());
    session.sheets.open({ kind: 'token', id: 'hero' }, true);
    ws.receive({ ...welcome(), you: { id: 'ana', name: 'Ana', role: 'observer', color: '#f00' } } as ServerMessage);
    expect(session.sheets.current).toEqual({ kind: 'token', id: 'hero', edit: false });
  });

  it('lets an observer seat watch but not act', () => {
    ws.receive({ ...welcome(), you: { id: 'ana', name: 'Ana', role: 'observer', color: '#f00' } } as ServerMessage);
    expect(session.canControl(session.tokens.get('hero')!)).toBe(false);
  });

  it("sends the GM's role changes", () => {
    ws.receive(gmWelcome());
    session.requests.setRole('ana', 'trusted');
    expect(ws.sent.at(-1)).toEqual({ t: 'setRole', player: 'ana', role: 'trusted' });
  });

  it("sends the GM's picks of what a seat plays, and a level up", () => {
    ws.receive(gmWelcome());
    session.requests.setPlays('ana', 'hero', true);
    expect(ws.sent.at(-1)).toEqual({ t: 'setPlays', player: 'ana', actor: 'hero', plays: true });
    session.requests.setPlays('ana', 'hero', false);
    expect(ws.sent.at(-1)).toEqual({ t: 'setPlays', player: 'ana', actor: 'hero', plays: false });
    session.requests.levelUp({ token: 'hero', class: 'fighter', hp: 'roll' });
    expect(ws.sent.at(-1)).toEqual({ t: 'levelUp', token: 'hero', class: 'fighter', hp: 'roll' });
  });

  it('saves a hotbar layout', () => {
    ws.receive(welcome());
    session.requests.setHotbar('hero', ['spell:fire-bolt', null]);
    expect(ws.sent.at(-1)).toEqual({ t: 'hotbar', token: 'hero', slots: ['spell:fire-bolt', null] });
  });

  it("asks to pack, attune and count a creature's gear", () => {
    ws.receive(welcome());
    session.requests.carry('hero', { kind: 'stow', item: 1, into: 0 });
    expect(ws.sent.at(-1)).toEqual({ t: 'carry', token: 'hero', change: { kind: 'stow', item: 1, into: 0 } });
  });

  it('spends hit dice and sets exhaustion', () => {
    ws.receive(welcome());
    session.requests.spendHitDie('hero');
    expect(ws.sent.at(-1)).toEqual({ t: 'hitDie', token: 'hero' });
    session.requests.setExhaustion('hero', 2);
    expect(ws.sent.at(-1)).toEqual({ t: 'exhaustion', token: 'hero', level: 2 });
  });

  it('asks for checks and rolls them', () => {
    ws.receive(gmWelcome());
    session.requests.requestCheck({ tokens: ['hero'], ability: 'dex', skill: 'stealth', kind: 'group', dc: 12 });
    expect(ws.sent.at(-1)).toEqual({
      t: 'requestCheck',
      tokens: ['hero'],
      ability: 'dex',
      skill: 'stealth',
      kind: 'group',
      dc: 12,
    });
    session.requests.rollCheck('hero', { ability: 'dex' }, 'card-1');
    expect(ws.sent.at(-1)).toEqual({ t: 'rollCheck', token: 'hero', ability: 'dex', card: 'card-1' });
    session.requests.rollCheck('hero', { ability: 'str', skill: 'athletics' });
    expect(ws.sent.at(-1)).toEqual({ t: 'rollCheck', token: 'hero', ability: 'str', skill: 'athletics' });
  });

  it('awards experience', () => {
    ws.receive(gmWelcome());
    session.requests.awardXp(['hero'], 150);
    expect(ws.sent.at(-1)).toEqual({ t: 'awardXp', tokens: ['hero'], xp: 150 });
  });

  it('takes legendary and lair actions', () => {
    ws.receive(gmWelcome());
    session.requests.legendary('dragon', 'tail-attack', 'hero');
    expect(ws.sent.at(-1)).toEqual({ t: 'legendary', token: 'dragon', option: 'tail-attack', target: 'hero' });
    session.requests.legendary('dragon', 'detect');
    expect(ws.sent.at(-1)).toEqual({ t: 'legendary', token: 'dragon', option: 'detect' });
    session.requests.lairAction('dragon', 'grasp');
    expect(ws.sent.at(-1)).toEqual({ t: 'lair', token: 'dragon', action: 'grasp' });
  });

  it('sends drops and shows why one was refused', () => {
    ws.receive(gmWelcome());
    session.drops.hidden = true;
    session.drops.onMap({ kind: 'monster', id: 'goblin', rules: '2014' }, [10, 10]);
    expect(ws.sent.at(-1)).toMatchObject({ t: 'spawn', hidden: true });
    session.drops.onMap({ kind: 'item', id: 'dagger' }, [900, 900]);
    expect(session.error?.message).toBe('Drop items on a creature');
  });

  it('sends what lands on the open sheet, with the part of it', () => {
    ws.receive(gmWelcome());
    session.drops.onSheet({ kind: 'item', id: 'dagger' });
    expect(ws.sent.at(-1)).not.toMatchObject({ t: 'drop' });
    session.sheets.open({ kind: 'token', id: 'hero' });
    session.drops.onSheet({ kind: 'spell', id: 'fireball', rules: '2014' }, 'inventory');
    expect(ws.sent.at(-1)).toEqual({
      t: 'drop',
      what: { kind: 'spell', id: 'fireball', rules: '2014' },
      onto: { kind: 'token', id: 'hero' },
      area: 'inventory',
    });
    session.drops.onSheet({ kind: 'monster', id: 'goblin', rules: '2014' });
    expect(session.error?.message).toBe('Drop creatures on the map');
    session.sheets.open({ kind: 'actor', id: 'bandit' });
    session.drops.onSheet({ kind: 'media', src: 'art/bandit.png' });
    expect(ws.sent.at(-1)).toMatchObject({ t: 'saveActor', actor: { id: 'bandit', img: 'art/bandit.png' } });
  });

  it('sends a drop to the sheet it landed on, not the front one', () => {
    ws.receive(gmWelcome());
    session.sheets.open({ kind: 'token', id: 'hero' });
    session.sheets.open({ kind: 'actor', id: 'bandit' });
    session.drops.onSheet({ kind: 'item', id: 'dagger' }, 'inventory', { kind: 'token', id: 'hero' });
    expect(ws.sent.at(-1)).toMatchObject({ t: 'drop', onto: { kind: 'token', id: 'hero' } });
  });

  it('pins a journal entry dropped on the map as a note', () => {
    ws.receive(gmWelcome());
    session.drops.onMap({ kind: 'journal', id: 'lore', name: 'Lore' }, [40, 60]);
    expect(ws.sent.at(-1)).toMatchObject({
      t: 'ops',
      ops: [{ op: 'create', doc: { type: 'note', x: 40, y: 60, entry: 'lore', label: 'Lore' } }],
    });
  });
});

describe('the GM tools send', () => {
  it('edits, deletions, spawns and actors', () => {
    ws.receive(welcome());
    session.requests.editToken('hero', {});
    session.requests.editToken('hero', { hp: 3 });
    session.requests.deleteToken('hero');
    session.drops.setHidden(false);
    session.drops.spawn({ kind: 'actor', id: 'bandit' }, [5, 5]);
    session.requests.saveActor({ ...token('bandit') });
    session.requests.deleteActor('bandit');
    session.requests.relinkToken('hero', 'unlink');
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
    expect(session.editor.viewCentre()).toEqual([0, 0]);
    session.editor.viewRect = { x: 100, y: 200, w: 400, h: 200 };
    expect(session.editor.viewCentre()).toEqual([300, 300]);
  });
});
