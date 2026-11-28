import { describe, expect, it } from 'vitest';
import { browserOf, ErrorCapture } from './error-capture.ts';

// What goes wrong in this browser, caught and held until the game takes it.

function thrown(target: EventTarget, error: unknown, message = 'Uncaught Error'): void {
  target.dispatchEvent(Object.assign(new Event('error'), { error, message, filename: 'map.js', lineno: 3 }));
}

function rejected(target: EventTarget, reason: unknown): void {
  target.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason }));
}

function caught(now = () => 0) {
  const capture = new ErrorCapture(now);
  const target = new EventTarget();
  const sent: unknown[] = [];
  capture.install(target, () => '/game/home');
  return { capture, target, sent, connect: () => capture.connect((r) => (sent.push(r), true)) };
}

describe('errors in this browser', () => {
  it('are caught when thrown and when a promise fails unhandled', () => {
    const { target, sent, connect } = caught();
    connect();
    thrown(target, new TypeError('x is undefined'));
    rejected(target, new Error('fetch failed'));
    expect(sent).toEqual([
      expect.objectContaining({ message: 'TypeError: x is undefined', where: 'error on /game/home' }),
      expect.objectContaining({ message: 'Error: fetch failed', where: 'unhandled promise on /game/home' }),
    ]);
    expect((sent[0] as { stack: string }).stack).toContain('error-capture.test.ts');
  });

  it('say where a script error came from when it has no error object', () => {
    const { target, sent, connect } = caught();
    connect();
    thrown(target, undefined, 'Script error.');
    rejected(target, 'just text');
    expect(sent).toEqual([
      expect.objectContaining({ message: 'Script error.', stack: 'map.js:3' }),
      expect.objectContaining({ message: 'just text' }),
    ]);
  });

  it('are held until the game connection takes them', () => {
    const { target, sent, connect } = caught();
    thrown(target, new Error('early'));
    expect(sent).toEqual([]);
    connect();
    expect(sent).toEqual([expect.objectContaining({ message: 'Error: early' })]);
  });

  it('are held again while the connection is down', () => {
    const { capture, target, sent } = caught();
    let up = false;
    capture.connect((r) => up && (sent.push(r), true));
    thrown(target, new Error('while down'));
    up = true;
    capture.connect((r) => (sent.push(r), true));
    expect(sent).toHaveLength(1);
  });

  it('send the same error once in a while, not every frame', () => {
    let now = 0;
    const { target, sent, connect } = caught(() => now);
    connect();
    const e = new Error('every frame');
    for (let i = 0; i < 100; i++) thrown(target, e);
    expect(sent).toHaveLength(1);
    now += 60_000;
    thrown(target, e);
    expect(sent).toHaveLength(2);
  });

  it('stop listening when taken out', () => {
    const capture = new ErrorCapture();
    const target = new EventTarget();
    const sent: unknown[] = [];
    capture.install(target)();
    capture.connect((r) => (sent.push(r), true));
    thrown(target, new Error('after'));
    expect(sent).toEqual([]);
  });
});

describe('the browser an error happened in', () => {
  it('is named shortly from its user agent', () => {
    const chrome =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    const firefox = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.1; rv:133.0) Gecko/20100101 Firefox/133.0';
    const safari =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1';
    const edge = `${chrome} Edg/131.0.0.0`;
    expect(browserOf(chrome)).toBe('Chrome 131 on Windows');
    expect(browserOf(firefox)).toBe('Firefox 133 on macOS');
    expect(browserOf(safari)).toBe('Safari 17 on iOS');
    expect(browserOf(edge)).toBe('Edge 131 on Windows');
    expect(browserOf('curl/8')).toBe('curl/8');
  });
});
