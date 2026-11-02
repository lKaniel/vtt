import { srdFor } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from './session.ts';
import { closeSession, fight, openSession, token, welcome, type FakeWebSocket } from './session.fixtures.ts';
import type { ActionTile } from './actions.ts';
import { gameKey, spaceReleased } from './game-keys.ts';
import { activateTile, canActivate } from './tile-use.ts';

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
    expect(session.sheet).toMatchObject({ kind: 'token', id: 'hero' });
    gameKey(session, press('c'));
    expect(session.sheet).toBeUndefined();
  });

  it('backs out with Esc: the sheet first, then the selection', () => {
    session.select('hero');
    session.openSheet({ kind: 'token', id: 'hero' });
    gameKey(session, press('Escape'));
    expect(session.sheet).toBeUndefined();
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

  it('holds Space to pan, and a tap of it ends your turn', () => {
    ws.receive({ t: 'combat', combat: fight(1) });
    const down = press(' ');
    gameKey(session, down);
    expect(down.prevented).toBe(true);
    expect(ws.sent.some((m) => (m as { t: string }).t === 'endTurn')).toBe(false);
    spaceReleased(session, press(' '));
    expect(sent()).toEqual({ t: 'endTurn' });
  });

  it('groups and locks tiles with the layer keys, for the GM in the tiles mode only', () => {
    const group = press('g', { ctrlKey: true });
    gameKey(session, group);
    expect(group.prevented).toBe(false);
    const gm = welcome([token('hero')]);
    ws.receive({ ...gm, you: { ...(gm as { you: object }).you, role: 'gm' } } as never);
    session.setMode('tiles');
    for (const key of ['g', 'l', ']']) {
      const e = press(key, { ctrlKey: true, shiftKey: key !== 'g' });
      gameKey(session, e);
      expect(e.prevented).toBe(true);
    }
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
    expect(session.sheet).toBeUndefined();
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
