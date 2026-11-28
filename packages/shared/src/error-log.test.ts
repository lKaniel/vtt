import { describe, expect, it } from 'vitest';
import { type ErrorEntry, logError, MAX_ERRORS } from './error-log.ts';

const boom = { source: 'browser' as const, message: 'boom', stack: 'Error: boom\n    at draw (map.ts:10)' };

describe('the error log', () => {
  it('keeps a new error with when it happened', () => {
    const [entry] = logError([], boom, 1000);
    expect(entry).toMatchObject({ ...boom, at: 1000, last: 1000, count: 1 });
    expect(entry!.id).toMatch(/\S/);
  });

  it('counts the same error again instead of keeping a copy, and moves it to the end', () => {
    let log = logError([], boom, 1000);
    log = logError(log, { source: 'server', message: 'other' }, 1500);
    log = logError(log, { ...boom, player: 'Ana' }, 2000);
    expect(log.map((e) => [e.message, e.count])).toEqual([
      ['other', 1],
      ['boom', 2],
    ]);
    expect(log[1]).toMatchObject({ at: 1000, last: 2000, player: 'Ana' });
  });

  it('tells apart errors with the same text thrown in different places', () => {
    let log = logError([], boom, 1);
    log = logError(log, { ...boom, stack: 'Error: boom\n    at walk (move.ts:3)' }, 2);
    expect(log).toHaveLength(2);
  });

  it('keeps only the newest errors', () => {
    let log: ErrorEntry[] = [];
    for (let i = 0; i < MAX_ERRORS + 5; i++) log = logError(log, { source: 'server', message: `e${i}` }, i);
    expect(log).toHaveLength(MAX_ERRORS);
    expect(log[0]!.message).toBe('e5');
  });

  it('cuts very long texts', () => {
    const [entry] = logError([], { source: 'server', message: 'x'.repeat(5000), stack: 'y'.repeat(20000) }, 1);
    expect(entry!.message.length).toBeLessThanOrEqual(1000);
    expect(entry!.stack!.length).toBeLessThanOrEqual(4000);
  });
});
