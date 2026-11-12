import { srdFor } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from '../session/session.ts';
import { closeSession, fight, openSession, token, welcome, type FakeWebSocket } from '../session/session.fixtures.ts';
import type { ActionTile } from '../play/actions.ts';
import { gameKey, spaceReleased } from './game-keys.ts';
import { activateTile, canActivate } from '../play/tile-use.ts';

// The game's keyboard (game-keys.ts): what each key does on the table.

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
  ws.receive(welcome([token('hero')]));
});

afterEach(() => closeSession(session));

/** A key press as the browser gives it; `prevented` says whether the game took it. */
function press(key: string, mods: { ctrlKey?: boolean; shiftKey?: boolean } = {}) {
  const e = {
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...mods,
    defaultPrevented: false,
    target: null,
    prevented: false,
    preventDefault() {
      e.prevented = true;
    },
  };
  return e;
}

const sent = () => ws.sent.at(-1);

describe('the game keys', () => {
  it('undoes and redoes with Ctrl+Z and Ctrl+Shift+Z', () => {
    gameKey(session, press('z', { ctrlKey: true }));
    expect(sent()).toEqual({ t: 'undo' });
    gameKey(session, press('z', { ctrlKey: true, shiftKey: true }));
    expect(sent()).toEqual({ t: 'redo' });
  });

  it('opens and closes the selected creature’s sheet with C', () => {
    session.select('hero');
    gameKey(session, press('c'));
    expect(session.sheets.current).toMatchObject({ kind: 'token', id: 'hero' });
    gameKey(session, press('c'));
    expect(session.sheets.current).toBeUndefined();
  });

  it('opens and shuts the adventure book with J', () => {
    gameKey(session, press('j'));
    expect(session.book.tab).toBe('quests');
    gameKey(session, press('j'));
    expect(session.book.tab).toBeUndefined();
  });

  it('C closes only the selected creature’s sheet when several are open', () => {
    session.sheets.open({ kind: 'actor', id: 'wolf' });
    session.select('hero');
    gameKey(session, press('c'));
    expect(session.sheets.list.map((s) => s.id)).toEqual(['wolf', 'hero']);
    session.sheets.open({ kind: 'actor', id: 'wolf' });
    gameKey(session, press('c'));
    expect(session.sheets.list.map((s) => s.id)).toEqual(['wolf']);
  });

  it('E opens the selected creature’s sheet for editing and switches its edit mode', () => {
    ws.receive({ ...welcome([token('hero')]), you: { id: 'gm', name: 'GM', role: 'gm', color: '#fff' } } as never);
    gameKey(session, press('e'));
    expect(session.sheets.current).toBeUndefined();
    session.sheets.open({ kind: 'token', id: 'hero' });
    gameKey(session, press('e'));
    expect(session.sheets.current?.edit).toBe(true);
    session.select('hero');
    session.sheets.shut({ kind: 'token', id: 'hero' });
    gameKey(session, press('e'));
    expect(session.sheets.current).toEqual({ kind: 'token', id: 'hero', edit: true });
    gameKey(session, press('e'));
    expect(session.sheets.current?.edit).toBe(false);
  });

  it('backs out with Esc: the sheet first, then the selection', () => {
    session.select('hero');
    session.sheets.open({ kind: 'token', id: 'hero' });
    gameKey(session, press('Escape'));
    expect(session.sheets.current).toBeUndefined();
    expect(session.selected).toBe('hero');
    gameKey(session, press('Escape'));
    expect(session.selected).toBeUndefined();
  });

  it('walks the selected creature a square with the arrows', () => {
    session.select('hero');
    const e = press('ArrowRight');
    gameKey(session, e);
    expect(sent()).toEqual({ t: 'move', token: 'hero', to: [150, 50] });
    expect(e.prevented).toBe(true);
  });

  it('flies the selected creature up and down 5 ft with Page Up and Page Down', () => {
    session.select('hero');
    gameKey(session, press('PageUp'));
    expect(sent()).toEqual({ t: 'editToken', token: 'hero', patch: { elevation: 5 } });
    gameKey(session, press('PageDown'));
    expect(sent()).toEqual({ t: 'editToken', token: 'hero', patch: { elevation: -5 } });
  });

  it('holds Space to pan, and a tap of it ends your creature’s turn', () => {
    ws.receive({ t: 'combat', combat: fight(1) });
    const down = press(' ');
    gameKey(session, down);
    expect(down.prevented).toBe(true);
    expect(ws.sent.some((m) => (m as { t: string }).t === 'endTurn')).toBe(false);
    spaceReleased(session, press(' '));
    expect(sent()).toEqual({ t: 'endTurn', token: 'hero' });
  });

  it('groups and locks tiles with the layer keys, for the GM in the tiles mode only', () => {
    const group = press('g', { ctrlKey: true });
    gameKey(session, group);
    expect(group.prevented).toBe(false);
    const gm = welcome([token('hero')]);
    ws.receive({ ...gm, you: { ...(gm as { you: object }).you, role: 'gm' } } as never);
    session.editor.setMode('tiles');
    for (const key of ['g', 'l', ']']) {
      const e = press(key, { ctrlKey: true, shiftKey: key !== 'g' });
      gameKey(session, e);
      expect(e.prevented).toBe(true);
    }
  });

  it('turns and sizes what the stamp brush holds with Q, E, - and =; E edits a sheet once it is put down', () => {
    const gm = welcome([token('hero')]);
    ws.receive({ ...gm, you: { ...(gm as { you: object }).you, role: 'gm' } } as never);
    session.editor.stamp.arm({ src: '/assets/barrel.webp', kind: 'image', size: [100, 100] });
    const turn = session.editor.stamp.look.turn;
    gameKey(session, press('e'));
    gameKey(session, press('e'));
    gameKey(session, press('q'));
    expect(session.editor.stamp.look.turn).toBe((turn + 15) % 360);
    const scale = session.editor.stamp.look.scale;
    gameKey(session, press('='));
    expect(session.editor.stamp.look.scale).toBeGreaterThan(scale);
    session.editor.setTool('select');
    const e = press('e');
    gameKey(session, e);
    expect(session.editor.stamp.look.turn).toBe((turn + 15) % 360);
  });

  it('uses the selected creature’s action bar tile with its number key', () => {
    const spell = srdFor('2014').spells.get('magic-missile')!;
    const sheet = { effects: [], caster: { level: 5, spells: [spell] } };
    ws.receive({ t: 'token', token: { ...token('hero'), sheet } as never });
    gameKey(session, press('1'));
    expect(session.actions.aiming).toBeUndefined();
    session.select('hero');
    gameKey(session, press('1'));
    expect(session.actions.aiming?.spell.id).toBe('magic-missile');
    gameKey(session, press('1'));
    expect(session.actions.aiming).toBeUndefined();
  });

  it('leaves keys the page already handled alone', () => {
    session.select('hero');
    gameKey(session, { ...press('c'), defaultPrevented: true });
    expect(session.sheets.current).toBeUndefined();
  });
});

describe('action bar tiles', () => {
  const potion = { id: 'potion-of-healing', name: 'Potion of Healing', type: 'gear', use: { heal: '2d4+2' } };
  const tile = (kind: 'item' | 'attack') =>
    kind === 'item'
      ? ({ kind, name: potion.name, icon: 'potion', spent: false, item: potion } as unknown as ActionTile)
      : ({ kind, name: 'Longsword', icon: 'sword', spent: false } as unknown as ActionTile);
  const hero = () => session.tokens.get('hero')!;

  it('readies an attack tile, and a second press puts it away', () => {
    activateTile(session, hero(), tile('attack'));
    expect(session.actions.armed).toBe('Longsword');
    activateTile(session, hero(), tile('attack'));
    expect(session.actions.armed).toBeUndefined();
  });

  it('uses a potion tile at once', () => {
    activateTile(session, hero(), tile('item'));
    expect(sent()).toEqual({ t: 'useItem', token: 'hero', item: 'potion-of-healing' });
  });

  it('lets a spent spell be cast for free but not a spent attack', () => {
    expect(canActivate({ ...tile('attack'), spent: true })).toBe(false);
    expect(canActivate({ kind: 'spell', spent: true } as unknown as ActionTile)).toBe(true);
  });
});
