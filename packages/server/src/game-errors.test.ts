import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';
import { ErrorLog } from './library/error-log.ts';
import { MapActions } from './actions/map-actions.ts';

let store: GameStore;
let game: Game;
let log: ErrorLog;
let now = 1000;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  log = new ErrorLog(undefined, () => now);
  game = new Game(store, { errors: log, now: () => now });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  return ws;
}

const broken = () =>
  vi.spyOn(MapActions.prototype, 'darkness').mockImplementation(() => {
    throw new TypeError("Cannot read properties of undefined (reading 'x')");
  });

describe('errors on the server', () => {
  it('are logged with what was being done and by whom, and the game goes on', () => {
    broken();
    const gm = seat('gm');
    expect(() => gm.receive({ t: 'darkness', darkness: 0.5 })).not.toThrow();
    expect(log.entries).toEqual([
      expect.objectContaining({
        source: 'server',
        message: "TypeError: Cannot read properties of undefined (reading 'x')",
        where: 'darkness',
        player: 'GM',
      }),
    ]);
    expect(log.entries[0]!.stack).toContain('game-errors.test.ts');
    const [toast] = gm.take('error');
    expect(toast!.message).toMatch(/went wrong/);
  });

  it('are shown to the GM as they happen', () => {
    broken();
    const gm = seat('gm');
    const ana = seat('ana');
    gm.take('errorLogged');
    ana.receive({ t: 'darkness', darkness: 0.5 });
    const [logged] = gm.take('errorLogged');
    expect(logged!.entry.where).toBe('darkness');
    expect(ana.take('errorLogged')).toEqual([]);
  });

  it('are no refusals: a refused action is not an error', () => {
    const ana = seat('ana');
    ana.receive({ t: 'darkness', darkness: 0.5 });
    expect(log.entries).toEqual([]);
  });
});

describe('errors in a browser', () => {
  it('are logged under the seat that reported them', () => {
    const ana = seat('ana');
    ana.receive({
      t: 'reportError',
      message: 'boom',
      stack: 'Error: boom\n at x',
      where: 'window',
      browser: 'Firefox',
    });
    expect(log.entries).toEqual([
      expect.objectContaining({
        source: 'browser',
        message: 'boom',
        player: 'Ana',
        where: 'window',
        browser: 'Firefox',
      }),
    ]);
    expect(ana.take('history')).toEqual([]);
  });

  it('are kept to a few a minute from one browser', () => {
    const ana = seat('ana');
    for (let i = 0; i < 50; i++) ana.receive({ t: 'reportError', message: `boom ${i}` });
    expect(log.entries.length).toBeLessThan(50);
    now += 61_000;
    ana.receive({ t: 'reportError', message: 'later' });
    expect(log.entries.at(-1)!.message).toBe('later');
  });
});

describe('the GM’s error log', () => {
  it('is sent to the GM on joining, and to nobody else', () => {
    log.add({ source: 'server', message: 'old' });
    const gm = seat('gm');
    const ana = seat('ana');
    expect(gm.take('errors')).toEqual([{ t: 'errors', entries: [expect.objectContaining({ message: 'old' })] }]);
    expect(ana.take('errors')).toEqual([]);
  });

  it('is cleared by the GM only', () => {
    log.add({ source: 'server', message: 'old' });
    const [gm, ana] = [seat('gm'), seat('ana')];
    gm.take('errors');
    ana.receive({ t: 'clearErrors' });
    expect(log.entries).toHaveLength(1);
    gm.receive({ t: 'clearErrors' });
    expect(log.entries).toEqual([]);
    expect(gm.take('errors')).toEqual([{ t: 'errors', entries: [] }]);
  });
});
