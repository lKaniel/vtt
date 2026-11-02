import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { readJson, removeJson, writeJson } from './json-files.ts';
import { checkSecret, type Hashed, hashSecret, sameText } from './secrets.ts';

// Who a browser is, Foundry style: there are no accounts. A browser's
// session holds the player it joined each game as (picked on the game's join
// screen, with that player's password if it has one), and whether it gave
// the server's admin password, which opens Setup (making, importing and
// deleting games, and managing every game's players). Kept as JSON in the
// server's data folder: sessions.json and admin.json (a salted scrypt hash,
// never the password). VTT_ADMIN_PASSWORD, when set, wins over admin.json.

const SESSION_DAYS = 30;
export const SESSION_MAX_AGE = SESSION_DAYS * 86_400;

const SessionSchema = z.object({
  /** Gave the admin password. */
  admin: z.boolean().default(false),
  /** The player this browser joined each game as: game id → player id. */
  seats: z.record(z.string(), z.string()).default({}),
  expires: z.number(),
});
export type Session = z.infer<typeof SessionSchema>;
const SessionsSchema = z.record(z.string(), z.unknown());
const AdminSchema = z.object({ salt: z.string(), hash: z.string() });

/** A problem with the admin password that the person can fix. */
export class SessionError extends Error {}

export class SessionStore {
  private sessions = new Map<string, Session>();
  private admin?: Hashed;

  constructor(
    readonly dir: string,
    /** VTT_ADMIN_PASSWORD: set, it is the admin password and Setup can't change it. */
    private envPassword?: string,
  ) {}

  async load(): Promise<void> {
    const raw = SessionsSchema.safeParse(await readJson(this.sessionsPath));
    for (const [token, value] of Object.entries(raw.success ? raw.data : {})) {
      const parsed = SessionSchema.safeParse(value);
      if (parsed.success) this.sessions.set(token, parsed.data);
    }
    const admin = AdminSchema.safeParse(await readJson(this.adminPath));
    this.admin = admin.success ? admin.data : undefined;
  }

  /** The server has an admin password; without one, Setup is open to anyone (as in Foundry). */
  get hasAdminPassword(): boolean {
    return !!this.envPassword || !!this.admin;
  }

  /** The admin password comes from the environment, so Setup can't change it. */
  get adminFixed(): boolean {
    return !!this.envPassword;
  }

  get(token: string | undefined): Session | undefined {
    const session = token ? this.sessions.get(token) : undefined;
    return session && session.expires >= Date.now() ? session : undefined;
  }

  /** Whether the browser may use Setup: it gave the admin password, or the server has none. */
  isAdmin(token: string | undefined): boolean {
    return !this.hasAdminPassword || !!this.get(token)?.admin;
  }

  /** The player this browser joined `game` as. */
  seatIn(token: string | undefined, game: string): string | undefined {
    return this.get(token)?.seats[game];
  }

  /** A new, empty session; its token. */
  async start(): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    this.sessions.set(token, { admin: false, seats: {}, expires: this.expiry() });
    await this.save();
    return token;
  }

  /** Remembers that the browser is `player` at `game` (its session must exist). */
  async sit(token: string, game: string, player: string): Promise<void> {
    await this.change(token, (s) => ({ ...s, seats: { ...s.seats, [game]: player } }));
  }

  /** Forgets the browser's player at `game`. */
  async leave(token: string, game: string): Promise<void> {
    await this.change(token, (s) => {
      const { [game]: _gone, ...seats } = s.seats;
      return { ...s, seats };
    });
  }

  /** Every session forgets `player` at `game` (removed from the game, or the game deleted when player is omitted). */
  async forget(game: string, player?: string): Promise<void> {
    for (const [token, s] of this.sessions) {
      if (!(game in s.seats) || (player && s.seats[game] !== player)) continue;
      const { [game]: _gone, ...seats } = s.seats;
      this.sessions.set(token, { ...s, seats });
    }
    await this.save();
  }

  /** Makes the session an admin's if `password` is the admin password; false if it isn't. */
  async unlockAdmin(token: string, password: string): Promise<boolean> {
    if (!(await this.isAdminPassword(password))) return false;
    await this.change(token, (s) => ({ ...s, admin: true }));
    return true;
  }

  private async isAdminPassword(password: string): Promise<boolean> {
    if (this.envPassword) return sameText(password, this.envPassword);
    return !!this.admin && (await checkSecret(password, this.admin));
  }

  /** Sets the admin password (null or empty: none, Setup open to anyone); this session stays admin. */
  async setAdminPassword(token: string, password: string | null): Promise<void> {
    if (this.envPassword) throw new SessionError('The admin password is set by VTT_ADMIN_PASSWORD on the server.');
    if (password && password.length < 4) throw new SessionError('Use an admin password of at least 4 characters.');
    this.admin = password ? await hashSecret(password) : undefined;
    if (this.admin) await writeJson(this.adminPath, this.admin);
    else await removeJson(this.adminPath);
    await this.change(token, (s) => ({ ...s, admin: true }));
  }

  /** Drops admin from the session (Setup's "Lock"). */
  async lockAdmin(token: string): Promise<void> {
    await this.change(token, (s) => ({ ...s, admin: false }));
  }

  async end(token: string): Promise<void> {
    this.sessions.delete(token);
    await this.save();
  }

  private async change(token: string, fn: (s: Session) => Session): Promise<void> {
    const session = this.get(token);
    if (!session) throw new SessionError('Your session ran out: reload the page.');
    this.sessions.set(token, { ...fn(session), expires: this.expiry() });
    await this.save();
  }

  private expiry(): number {
    return Date.now() + SESSION_MAX_AGE * 1000;
  }

  private get sessionsPath(): string {
    return join(this.dir, 'sessions.json');
  }

  private get adminPath(): string {
    return join(this.dir, 'admin.json');
  }

  private async save(): Promise<void> {
    const now = Date.now();
    for (const [token, s] of this.sessions) if (s.expires < now) this.sessions.delete(token);
    await writeJson(this.sessionsPath, Object.fromEntries(this.sessions));
  }
}
