import type { ErrorEntry } from '@vtt/shared';
import type { ClientMessage, ServerMessage } from '@vtt/system-dnd5e';
import { readJsonPref, writePref } from '../prefs.ts';
import { browserOf, type ErrorCapture, errorCapture } from './error-capture.ts';
import type { SessionPart } from './session-part.ts';

// The error log in the session, as `session.errors`: this browser's errors
// (error-capture.ts) go to the server once the game is joined, and the GM
// holds the game's log (shared/error-log.ts) for the Errors tab, with how
// many came since they last looked (kept per game in this browser).

/** What the error log needs of the session. */
export interface ErrorHost {
  readonly status: string;
  readonly gameId?: string;
  send(msg: ClientMessage): void;
}

export class ErrorReports implements SessionPart {
  /** GM: the game's errors, oldest first. */
  entries: ErrorEntry[] = [];
  /** GM: errors that came (or came again) since the Errors tab was last looked at. */
  unseen = 0;
  private browser = browserOf((globalThis.navigator as Navigator | undefined)?.userAgent ?? '');
  /** When the latest error the GM looked at last happened. */
  private seenAt?: number;

  constructor(
    private readonly s: ErrorHost,
    private readonly ev: { changed(): void },
    private readonly capture: ErrorCapture = errorCapture,
  ) {}

  welcome(): void {
    this.capture.connect((report) => {
      if (this.s.status !== 'open') return false;
      this.s.send({ t: 'reportError', ...report, ...(this.browser && { browser: this.browser }) });
      return true;
    });
  }

  receive(msg: ServerMessage): boolean | undefined {
    if (msg.t === 'errors') this.entries = msg.entries;
    else if (msg.t === 'errorLogged') this.entries = [...this.entries.filter((e) => e.id !== msg.entry.id), msg.entry];
    else return undefined;
    this.count();
    return true;
  }

  /** The GM looked at the log: the count of new errors goes back to none. */
  seen(): void {
    if (!this.unseen) return;
    this.seenAt = Math.max(0, ...this.entries.map((e) => e.last));
    writePref(this.seenKey, String(this.seenAt));
    this.unseen = 0;
    this.ev.changed();
  }

  /** GM: empties the game's log. */
  clear(): void {
    this.s.send({ t: 'clearErrors' });
  }

  /** The log as plain text, newest first, to paste into a bug report or a chat with Claude. */
  text(): string {
    return [...this.entries].reverse().map(entryText).join('\n\n');
  }

  private count(): void {
    this.seenAt ??= Number(readJsonPref(this.seenKey) ?? 0);
    const seen = this.seenAt;
    this.unseen = this.entries.filter((e) => e.last > seen).length;
  }

  private get seenKey(): string {
    return `errors-seen:${this.s.gameId ?? 'home'}`;
  }
}

function entryText(e: ErrorEntry): string {
  const who = [e.source, e.player, e.browser, e.where].filter(Boolean).join(', ');
  const times = e.count > 1 ? ` ×${e.count}` : '';
  const head = `[${new Date(e.last).toISOString()}] ${e.message}${times} (${who})`;
  return e.stack ? `${head}\n${e.stack}` : head;
}
