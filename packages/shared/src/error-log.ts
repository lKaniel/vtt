// The GM's error log: what went wrong in the players' browsers and on the
// server, kept per game (the server's library/error-log.ts) and shown in the
// GM's Errors tab. The same error again is counted, not kept twice.

export type ErrorSource = 'browser' | 'server';

/** One error, as the GM's log shows it. */
export interface ErrorEntry {
  id: string;
  source: ErrorSource;
  message: string;
  stack?: string;
  /** What was going on: the message the server was handling, or the browser's page and kind of error. */
  where?: string;
  /** Whose seat it happened to (its name). */
  player?: string;
  /** The browser, from its user agent. */
  browser?: string;
  /** When it first and last happened, ms. */
  at: number;
  last: number;
  /** How many times it happened. */
  count: number;
}

/** What is known of an error as it happens. */
export type ErrorReport = Omit<ErrorEntry, 'id' | 'at' | 'last' | 'count'>;

/** Errors kept per game; older ones go. */
export const MAX_ERRORS = 200;

/** The longest texts kept (a stack is cut, not dropped). */
export const ERROR_TEXT = { message: 1000, stack: 4000, where: 200, player: 80, browser: 120 } as const;

const cut = (text: string | undefined, max: number) => (text === undefined ? undefined : text.slice(0, max));

/** A report with its texts cut to size and its empty fields left out. */
function trimmed(report: ErrorReport): ErrorReport {
  const out: ErrorReport = { source: report.source, message: cut(report.message, ERROR_TEXT.message) ?? '' };
  for (const key of ['stack', 'where', 'player', 'browser'] as const) {
    const text = cut(report[key], ERROR_TEXT[key]);
    if (text) out[key] = text;
  }
  return out;
}

/** Errors are the same when their source, text and the first place of their stack match. */
function sameAs(entry: ErrorEntry, report: ErrorReport): boolean {
  return (
    entry.source === report.source && entry.message === report.message && topOf(entry.stack) === topOf(report.stack)
  );
}

/** The stack's first line that names a place (the message is the line before it). */
function topOf(stack: string | undefined): string {
  return (
    stack
      ?.split('\n')
      .find((line) => /(^\s*at\s)|@/.test(line))
      ?.trim() ?? ''
  );
}

const freshId = (now: number) => `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** The log with `report` added at the end (or counted again, when it is already there), keeping the newest MAX_ERRORS. */
export function logError(entries: readonly ErrorEntry[], report: ErrorReport, now: number): ErrorEntry[] {
  const next = trimmed(report);
  const old = entries.find((e) => sameAs(e, next));
  const entry: ErrorEntry = old
    ? { ...old, ...next, stack: old.stack ?? next.stack, last: now, count: old.count + 1 }
    : { ...next, id: freshId(now), at: now, last: now, count: 1 };
  return [...entries.filter((e) => e !== old), entry].slice(-MAX_ERRORS);
}
