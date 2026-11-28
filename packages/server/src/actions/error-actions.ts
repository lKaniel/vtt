import { isGm, type ErrorEntry } from '@vtt/shared';
import type { ServerMessage } from '@vtt/system-dnd5e';
import { describeError, type ErrorLog } from '../library/error-log.ts';
import type { Client } from '../game-client.ts';
import { Refusal } from '../play/table.ts';

// The GM's error log at the table (library/error-log.ts keeps it): browsers
// report what went wrong in them, the game logs what went wrong handling a
// message, and the GMs are shown each error as it comes.

/** What a client sends about the error log. */
export type ErrorMessage =
  { t: 'reportError'; message: string; stack?: string; where?: string; browser?: string } | { t: 'clearErrors' };

export function isErrorMessage(msg: { t: string }): msg is ErrorMessage {
  return msg.t === 'reportError' || msg.t === 'clearErrors';
}

/** Reports one browser may make a minute; a page failing every frame stops there. */
const REPORTS_A_MINUTE = 10;
const MINUTE = 60_000;

export class ErrorActions {
  /** When each client's latest reports came, to keep them to a few a minute. */
  private reports = new WeakMap<Client, number[]>();

  constructor(
    private readonly log: ErrorLog,
    private readonly gms: () => Iterable<Client>,
    private readonly send: (c: Client, msg: ServerMessage) => void,
    private readonly now: () => number,
  ) {
    log.listen((entry) => this.tell(entry));
  }

  handle(c: Client, msg: ErrorMessage): void {
    if (msg.t === 'clearErrors') return this.clear(c);
    if (!this.allowed(c)) return;
    const { t: _, ...report } = msg;
    this.log.add({ source: 'browser', ...report, player: c.player.name });
  }

  /** A GM joined: the log as it is. */
  greet(c: Client): void {
    if (isGm(c.player)) this.send(c, { t: 'errors', entries: this.log.entries });
  }

  /** Handling `doing` for `c` (none: the game itself) failed with `e`. */
  failed(doing: string, e: unknown, c?: Client): void {
    console.error(`[game] ${doing} failed:`, e);
    this.log.add({ source: 'server', ...describeError(e), where: doing, ...(c && { player: c.player.name }) });
  }

  private clear(c: Client): void {
    if (!isGm(c.player)) throw new Refusal('Only the GM can clear the error log.');
    this.log.clear();
  }

  private allowed(c: Client): boolean {
    const now = this.now();
    const recent = (this.reports.get(c) ?? []).filter((at) => now - at < MINUTE);
    const ok = recent.length < REPORTS_A_MINUTE;
    this.reports.set(c, ok ? [...recent, now] : recent);
    return ok;
  }

  private tell(entry: ErrorEntry | undefined): void {
    const msg: ServerMessage = entry ? { t: 'errorLogged', entry } : { t: 'errors', entries: [] };
    for (const c of this.gms()) this.send(c, msg);
  }
}
