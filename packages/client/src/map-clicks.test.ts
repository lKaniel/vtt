import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Token } from '@vtt/system-dnd5e';
import { clickToken, formationMoves, moveSelectionTo, walkUpPoint } from './map-clicks.ts';
import { closeSession, fight, openSession, token, welcome, type FakeWebSocket } from './session.fixtures.ts';
import type { Session } from './session.ts';

describe('formationMoves', () => {
  const a = { id: 'a', x: 0, y: 0 };
  const b = { id: 'b', x: 100, y: 0 };

  it('sends the lead to the point and the rest keep their places around it', () => {
    const moves = formationMoves([a, b], 'a', [500, 200]);
    expect(moves).toContainEqual({ id: 'a', to: [500, 200] });
    expect(moves).toContainEqual({ id: 'b', to: [600, 200] });
  });

  it('moves the front of the group first, so no one walks into a friend', () => {
    expect(formationMoves([a, b], 'a', [500, 0]).map((m) => m.id)).toEqual(['b', 'a']);
    expect(formationMoves([a, b], 'a', [-500, 0]).map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('walkUpPoint', () => {
  it('stops just outside the other creature, on the side you come from', () => {
    const [x, y] = walkUpPoint({ x: 0, y: 0, r: 50 }, { x: 500, y: 0, r: 50 });
    expect(y).toBe(0);
    expect(x).toBeLessThan(400);
    expect(x).toBeGreaterThan(390);
  });

  it('stays put when already next to it', () => {
    expect(walkUpPoint({ x: 0, y: 0, r: 50 }, { x: 100, y: 0, r: 50 })).toEqual([0, 0]);
  });
});

describe('map clicks', () => {
  let session: Session;
  let ws: FakeWebSocket;
  const goblin: Token = { ...token('goblin', 550), ownership: undefined };
  const sheet = { attacks: [{ name: 'Longsword' }, { name: 'Shortbow' }] } as never;

  beforeEach(() => {
    ({ session, ws } = openSession());
    ws.receive(
      welcome([token('hero'), token('ally', 150), goblin, { ...token('bard', 50, 250), ownership: undefined }]),
    );
    ws.receive({ t: 'token', token: { ...token('hero'), sheet } });
  });

  afterEach(() => {
    closeSession(session);
  });

  const moves = () => ws.sent.filter((m) => (m as { t: string }).t === 'move');

  it('walks every selected creature you control to a clicked spot, in formation', () => {
    session.setSelection([session.tokenKey('hero'), session.tokenKey('ally')]);
    session.setPrimary('hero');
    expect(moveSelectionTo(session, [450, 450])).toBe(true);
    expect(moves()).toContainEqual({ t: 'move', token: 'hero', to: [450, 450] });
    expect(moves()).toContainEqual({ t: 'move', token: 'ally', to: [550, 450] });
  });

  it('does nothing on a click with nothing selected', () => {
    expect(moveSelectionTo(session, [450, 450])).toBe(false);
    expect(moves()).toEqual([]);
  });

  it('a click on your own creature selects it alone', () => {
    session.select('hero');
    expect(clickToken(session, 'ally')).toEqual({ kind: 'select' });
  });

  it('a click on someone you cannot control does nothing outside a fight', () => {
    session.select('hero');
    expect(clickToken(session, 'goblin')).toEqual({ kind: 'none' });
  });

  it('in a fight, a click on a foe offers your attacks and walking up to it', () => {
    ws.receive({ t: 'combat', combat: fight(1) });
    session.select('hero');
    const result = clickToken(session, 'goblin');
    expect(result.kind).toBe('prompt');
    const items = result.kind === 'prompt' ? result.items : [];
    expect(items.map((i) => i.label)).toEqual(['Attack: Longsword', 'Attack: Shortbow', 'Interact (walk up to it)']);
    items[0]!.run();
    expect(ws.sent.at(-1)).toEqual({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Longsword' });
    items[2]!.run();
    const walk = ws.sent.at(-1) as { t: string; token: string; to: [number, number] };
    expect(walk).toMatchObject({ t: 'move', token: 'hero' });
    expect(walk.to[0]).toBeGreaterThan(440);
    expect(walk.to[0]).toBeLessThan(450);
  });

  it('in a fight, a creature that is not in it is left alone', () => {
    ws.receive({ t: 'combat', combat: fight(1) });
    session.select('hero');
    expect(clickToken(session, 'bard')).toEqual({ kind: 'none' });
  });

  it('turn-based mode outside a fight is not a fight', () => {
    ws.receive({ t: 'combat', combat: { ...fight(1), peaceful: true } });
    session.select('hero');
    expect(clickToken(session, 'goblin')).toEqual({ kind: 'none' });
  });
});
