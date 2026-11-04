import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Chunk, Wall } from '@vtt/shared';
import { nameFromFile, objectAt, objectOf } from './objects.ts';
import { objectMenu } from './object-uses.ts';
import { closeSession, openSession, token, welcome, type FakeWebSocket } from '../session/session.fixtures.ts';
import type { Session } from '../session/session.ts';

const door: Wall = { id: 'cell', a: [800, 0], b: [800, 100], door: 'locked', name: 'Cell door', description: 'Bars.' };
const plainDoor: Wall = { id: 'plain', a: [800, 400], b: [800, 500], door: 'closed' };
const lever = {
  id: 'lever',
  kind: 'image',
  src: 'pack://props/Levers/Lever_Wood-02.webp',
  x: 300,
  y: 300,
  w: 50,
  h: 50,
  trigger: { on: 'click', actions: [] },
};
const statue = { id: 'statue', kind: 'rect', x: 0, y: 600, w: 100, h: 100, color: '#888', description: 'A worn hero.' };
const rug = { id: 'rug', kind: 'rect', x: 0, y: 800, w: 100, h: 100, color: '#800' };
const chunk = { walls: [door, plainDoor], tiles: [lever, statue, rug], lights: [] } as unknown as Chunk;
const chest = { ...token('chest', 550, 250), name: 'Old chest', pile: { kind: 'loot', locked: true } };

describe('objects on the map', () => {
  let session: Session;
  let ws: FakeWebSocket;

  beforeEach(() => {
    ({ session, ws } = openSession());
    ws.receive(welcome([token('hero'), { ...chest, ownership: undefined } as never]));
    session.setView(['0_0']);
    ws.receive({ t: 'chunk', key: '0_0', chunk });
    session.select('hero');
  });

  afterEach(() => closeSession(session));

  it('are the doors, the tiles that answer clicks or say something, and the piles', () => {
    expect(objectAt(session, [795, 50])).toMatchObject({
      ref: { kind: 'door', chunk: '0_0', id: 'cell' },
      name: 'Cell door',
      description: 'Bars.',
      state: 'Locked',
    });
    expect(objectAt(session, [320, 320])).toMatchObject({ ref: { kind: 'tile', id: 'lever' }, name: 'Lever wood' });
    expect(objectAt(session, [50, 650])).toMatchObject({
      ref: { kind: 'tile', id: 'statue' },
      description: 'A worn hero.',
    });
    expect(objectAt(session, [560, 260])).toMatchObject({ ref: { kind: 'pile', id: 'chest' }, name: 'Old chest' });
  });

  it('leave out plain tiles, bare ground and creatures', () => {
    expect(objectAt(session, [50, 850])).toBeUndefined();
    expect(objectAt(session, [500, 900])).toBeUndefined();
    expect(objectAt(session, [50, 50])).toBeUndefined();
  });

  it('are found again by reference, with a door named "Door" when it has no name', () => {
    expect(objectOf(session, { kind: 'door', chunk: '0_0', id: 'plain' })).toMatchObject({
      name: 'Door',
      state: 'Closed',
    });
    expect(objectOf(session, { kind: 'tile', id: 'gone' })).toBeUndefined();
  });

  it('offer Inspect first, then their uses', () => {
    const labels = (at: [number, number]) => objectMenu(session, objectAt(session, at)!).map((m) => m.label);
    expect(labels([795, 450])).toEqual(['Inspect', 'Open']);
    expect(labels([320, 320])).toEqual(['Inspect', 'Use']);
    expect(labels([50, 650])).toEqual(['Inspect']);
    expect(labels([560, 260])).toEqual(['Inspect', 'Open', 'Walk up to it']);
    expect(labels([795, 50])).toEqual(['Inspect']);
  });

  it('Inspect opens the inspect card; a use does what a click would', () => {
    const [inspect, open] = objectMenu(session, objectAt(session, [795, 450])!);
    inspect!.run();
    expect(session.inspect.current).toEqual({ kind: 'door', chunk: '0_0', id: 'plain' });
    open!.run();
    expect(ws.sent.at(-1)).toEqual({ t: 'door', chunk: '0_0', wall: 'plain', state: 'open' });
  });
});

describe('nameFromFile', () => {
  it('turns a picture file into a name', () => {
    expect(nameFromFile('pack://props/Levers/Lever_Wood-02.webp')).toBe('Lever wood');
    expect(nameFromFile('/assets/chest.closed.png')).toBe('Chest closed');
    expect(nameFromFile('/assets/0001.png')).toBeUndefined();
  });
});
