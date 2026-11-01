import { HOUR, MINUTE } from '@vtt/shared';
import type { ServerMessage } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './session.ts';
import { closeSession, fight, openSession, welcome, type FakeWebSocket } from './session.fixtures.ts';
import { effectLeft, parseMonths, quickSkips, shortDate, turnMode } from './session-time.ts';

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(50_000);
  ({ session, ws } = openSession());
});

afterEach(() => {
  closeSession(session);
  vi.useRealTimers();
});

const clockDoc = (data: object) => ({ type: 'clock', id: 'clock', rev: 1, time: 0, speed: 1, ...data });
const welcomeWith = (clock: object, serverTime: number): ServerMessage => ({
  ...(welcome() as Extract<ServerMessage, { t: 'welcome' }>),
  docs: { time: [clockDoc(clock)] },
  serverTime,
});

describe('the game clock in the client', () => {
  it('reads the clock and calendar the server sent', () => {
    ws.receive(welcomeWith({ time: 30 * 24 * HOUR + 9 * HOUR }, 50_000));
    expect(session.clock().calendar.months).toHaveLength(12);
    expect(session.gameTime()).toBe(30 * 24 * HOUR + 9 * HOUR);
    expect(session.dateText()).toBe('Wednesday, 31 January 1, 09:00');
    expect(shortDate(session.clock().calendar, session.gameTime())).toBe('31 Jan 1, 09:00');
  });

  it('runs a running clock by the server’s time, not the browser’s', () => {
    // The server's clock is 10 s ahead; the clock started at its 40 s.
    ws.receive(welcomeWith({ time: 100, running: true, since: 40_000 }, 60_000));
    expect(session.gameTime()).toBe(120);
    vi.setSystemTime(53_000);
    expect(session.gameTime()).toBe(123);
  });

  it('sends the GM’s clock changes and turn-based mode', () => {
    ws.receive(welcomeWith({}, 50_000));
    session.clockAction({ do: 'skip', seconds: MINUTE });
    expect(ws.sent.at(-1)).toEqual({ t: 'clock', action: { do: 'skip', seconds: MINUTE } });
    session.setTurnBased(true);
    expect(ws.sent.at(-1)).toEqual({ t: 'turnBased', on: true });
  });

  it('knows a fight and turn-based mode apart', () => {
    ws.receive(welcomeWith({}, 50_000));
    expect(turnMode(session.combat)).toBe('free');
    ws.receive({ t: 'combat', combat: fight(0) });
    expect(turnMode(session.combat)).toBe('fight');
    ws.receive({ t: 'combat', combat: { ...fight(0), peaceful: true } });
    expect(turnMode(session.combat)).toBe('turns');
  });
});

describe('how long an effect has left', () => {
  it('counts rounds in a fight and game time out of one', () => {
    const e = { id: 'e', name: 'Bless', rounds: 10, endsAt: 100 };
    expect(effectLeft(e, { now: 40, fighting: true })).toBe('10 rd');
    expect(effectLeft(e, { now: 40, fighting: false })).toBe('1 min left');
    expect(effectLeft({}, { now: 0, fighting: false })).toBeUndefined();
  });

  it('offers the skips a GM wants most', () => {
    expect(quickSkips.map((s) => s.label)).toEqual(['+1 min', '+10 min', '+1 h', '+8 h', '+1 day']);
  });
});

describe('the calendar form', () => {
  it('reads months as name and days, a line each', () => {
    expect(parseMonths('Frost 30\n  Long Night  31 \nbroken')).toEqual([
      { name: 'Frost', days: 30 },
      { name: 'Long Night', days: 31 },
    ]);
  });
});
