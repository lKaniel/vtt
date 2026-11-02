import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Chunk, Wall } from '@vtt/shared';
import { clickSnapped, clickTile, openDoor } from './interact.ts';
import { closeSession, openSession, token, welcome, type FakeWebSocket } from '../session/session.fixtures.ts';
import type { Session } from '../session/session.ts';

const door: Wall = { id: 'door', a: [800, 0], b: [800, 100], door: 'closed' };
const lever = {
  id: 'lever',
  kind: 'rect',
  x: 300,
  y: 300,
  w: 50,
  h: 50,
  color: '#888',
  trigger: { on: 'click', actions: [] },
};
const chunk = { walls: [door], tiles: [lever], lights: [] } as unknown as Chunk;

describe('using doors and tiles from afar', () => {
  let session: Session;
  let ws: FakeWebSocket;

  beforeEach(() => {
    ({ session, ws } = openSession());
    ws.receive(welcome([token('hero')]));
    session.setView(['0_0']);
    ws.receive({ t: 'chunk', key: '0_0', chunk });
    session.select('hero');
  });

  afterEach(() => closeSession(session));

  const sent = () => ws.sent.filter((m) => ['move', 'door', 'trigger'].includes((m as { t: string }).t));

  it('walks up to a door, then opens it', () => {
    openDoor(session, '0_0', door, false);
    const [move, open] = sent() as [{ t: string; to: [number, number] }, unknown];
    expect(move).toMatchObject({ t: 'move', token: 'hero' });
    expect(move.to[0]).toBeGreaterThan(740);
    expect(move.to[0]).toBeLessThan(800);
    expect(open).toEqual({ t: 'door', chunk: '0_0', wall: 'door', state: 'open' });
  });

  it('walks up to a tile that answers clicks, then uses it', () => {
    clickTile(session, 'lever');
    expect(sent().map((m) => (m as { t: string }).t)).toEqual(['move', 'trigger']);
  });

  it('a ground click next to a door uses the door; on bare ground it is not taken', () => {
    expect(clickSnapped(session, [790, 70])).toBe(true);
    expect(sent().at(-1)).toMatchObject({ t: 'door', state: 'open' });
    expect(clickSnapped(session, [500, 500])).toBe(false);
  });

  it("doesn't walk when nothing of yours is selected", () => {
    session.select(undefined);
    openDoor(session, '0_0', door, false);
    expect(sent()).toEqual([{ t: 'door', chunk: '0_0', wall: 'door', state: 'open' }]);
  });
});
