// What goes wrong in this browser (a thrown error, a promise nobody
// caught), caught from the moment the page starts and held until a game
// connection takes it to the GM's error log (session-errors.ts). The same
// error is sent once a minute at most, so a map failing every frame
// doesn't flood the table.

/** An error as this browser reports it. */
export interface BrowserError {
  message: string;
  stack?: string;
  /** The kind of error and the page it happened on. */
  where: string;
}

/** Takes a report to the server; false when it can't now (the connection is down). */
type Sink = (report: BrowserError) => boolean;

/** Reports held while no game is connected; older ones go. */
const MAX_HELD = 20;
/** The same error is sent again after this long. */
const AGAIN_MS = 60_000;

/** An error's name and text, and its stack (or, for a script's bare error event, where it was thrown). */
function describe(error: unknown, fallback?: string, place?: string): Pick<BrowserError, 'message' | 'stack'> {
  if (error instanceof Error)
    return { message: `${error.name}: ${error.message}`, ...(error.stack && { stack: error.stack }) };
  const message = error === undefined ? (fallback ?? 'Unknown error') : textOf(error);
  return { message, ...(place && { stack: place }) };
}

/** A thrown value that is no Error, as text. */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    const json = JSON.stringify(value) as string | undefined;
    return json ?? typeof value;
  } catch {
    return typeof value;
  }
}

export class ErrorCapture {
  private held: BrowserError[] = [];
  private sink?: Sink;
  /** When each error was last sent, by its text and stack. */
  private sent = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Listens for errors on `target` (the window) from now on; the result stops it. */
  install(target: EventTarget, page: () => string = () => location.pathname): () => void {
    const onError = (e: Event) => {
      const { message, filename, lineno } = e as ErrorEvent;
      const error = (e as { error?: unknown }).error;
      const place = filename ? `${filename}:${lineno}` : undefined;
      this.report({ ...describe(error, message, place), where: `error on ${page()}` });
    };
    const onRejection = (e: Event) =>
      this.report({ ...describe((e as PromiseRejectionEvent).reason), where: `unhandled promise on ${page()}` });
    target.addEventListener('error', onError);
    target.addEventListener('unhandledrejection', onRejection);
    return () => {
      target.removeEventListener('error', onError);
      target.removeEventListener('unhandledrejection', onRejection);
    };
  }

  /** An error to send, unless the same one went a moment ago. */
  report(report: BrowserError): void {
    const key = `${report.message}\n${report.stack ?? ''}`;
    const now = this.now();
    const last = this.sent.get(key);
    if (last !== undefined && now - last < AGAIN_MS) return;
    this.sent.set(key, now);
    if (!this.sink?.(report)) this.held = [...this.held, report].slice(-MAX_HELD);
  }

  /** A game connection takes the reports from now on, and those held till now. */
  connect(sink: Sink): void {
    this.sink = sink;
    const held = this.held;
    this.held = [];
    for (const report of held) if (!sink(report)) this.held.push(report);
  }
}

/** This page's errors, caught from its start (main.tsx). */
export const errorCapture = new ErrorCapture();

const BROWSERS: [RegExp, string][] = [
  [/Edg\/(\d+)/, 'Edge'],
  [/OPR\/(\d+)/, 'Opera'],
  [/Firefox\/(\d+)/, 'Firefox'],
  [/Chrome\/(\d+)/, 'Chrome'],
  // Only Safari says Version/ among the browsers left by now.
  [/Version\/(\d+)/, 'Safari'],
];
const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X/, 'macOS'],
  [/Linux/, 'Linux'],
];

/** A short name for a browser ("Chrome 131 on Windows"), from its user agent. */
export function browserOf(agent: string): string {
  const browser = BROWSERS.map(([re, name]) => [re.exec(agent), name] as const).find(([m]) => m);
  if (!browser) return agent.slice(0, 120);
  const system = SYSTEMS.find(([re]) => re.test(agent))?.[1];
  const name = `${browser[1]} ${browser[0]![1]}`;
  return system ? `${name} on ${system}` : name;
}
