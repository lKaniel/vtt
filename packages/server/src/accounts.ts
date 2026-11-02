import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { readJson, readJsonDir, writeJson } from './json-files.ts';
import { checkSecret, hashSecret, sameText } from './secrets.ts';

// Accounts and sign-in sessions, kept as JSON in the server's data folder:
// accounts/<id>.json (a salted scrypt hash, never the password) and
// sessions.json. Self-hosted for friends, so there's no e-mail or recovery:
// the admin can delete an account file to reset it.

const SESSION_DAYS = 30;

const AccountFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  salt: z.string(),
  hash: z.string(),
  /** The server's admin: the first account, or (with an admin password) whoever gave it. */
  admin: z.boolean().default(false),
  created: z.number(),
});
type AccountFile = z.infer<typeof AccountFileSchema>;

/** An account as the rest of the server sees it. */
export interface Account {
  id: string;
  name: string;
  admin: boolean;
}

const SessionSchema = z.object({ account: z.string(), expires: z.number() });
const SessionsSchema = z.record(z.string(), SessionSchema);

/** A sign-up or sign-in problem the player can fix. */
export class AccountError extends Error {}

const publicAccount = ({ id, name, admin }: AccountFile): Account => ({ id, name, admin });

export class AccountStore {
  private accounts = new Map<string, AccountFile>();
  private sessions = new Map<string, z.infer<typeof SessionSchema>>();

  constructor(
    readonly dir: string,
    /** The admin password (VTT_ADMIN_PASSWORD): set, it is the way to become admin, not being first. */
    private adminPassword?: string,
  ) {}

  /** Whether becoming admin takes the admin password. */
  get adminLocked(): boolean {
    return !!this.adminPassword;
  }

  /** Makes the account the server's admin if `password` is the admin password; false if it isn't. */
  async unlockAdmin(id: string, password: string): Promise<boolean> {
    const file = this.accounts.get(id);
    if (!file || !this.adminPassword || !sameText(password, this.adminPassword)) return false;
    const admin = { ...file, admin: true };
    this.accounts.set(id, admin);
    await writeJson(join(this.dir, 'accounts', `${id}.json`), admin);
    return true;
  }

  async load(): Promise<void> {
    for (const raw of await readJsonDir(join(this.dir, 'accounts'))) {
      const parsed = AccountFileSchema.safeParse(raw);
      if (parsed.success) this.accounts.set(parsed.data.id, parsed.data);
    }
    const sessions = SessionsSchema.safeParse(await readJson(join(this.dir, 'sessions.json')));
    if (sessions.success) this.sessions = new Map(Object.entries(sessions.data));
  }

  /** The server's admin: the first account made. */
  admin(): Account | undefined {
    const file = [...this.accounts.values()].find((a) => a.admin);
    return file && publicAccount(file);
  }

  get(id: string): Account | undefined {
    const file = this.accounts.get(id);
    return file && publicAccount(file);
  }

  async register(input: { username: string; password: string; name: string }): Promise<Account> {
    const id = input.username.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,23}$/.test(id)) {
      throw new AccountError('Usernames are 2 to 24 letters, digits or dashes.');
    }
    if (this.accounts.has(id)) throw new AccountError('That username is taken.');
    if (input.password.length < 6) throw new AccountError('Use a password of at least 6 characters.');
    const { salt, hash } = await hashSecret(input.password);
    const name = input.name.trim().slice(0, 40) || input.username;
    const admin = !this.adminPassword && this.accounts.size === 0;
    const file: AccountFile = { id, name, salt, hash, admin, created: Date.now() };
    this.accounts.set(id, file);
    await writeJson(join(this.dir, 'accounts', `${id}.json`), file);
    return publicAccount(file);
  }

  /** The account, if the password is right. */
  async login(username: string, password: string): Promise<Account | undefined> {
    const file = this.accounts.get(username.trim().toLowerCase());
    if (!file) return undefined;
    return (await checkSecret(password, file)) ? publicAccount(file) : undefined;
  }

  /** A new session token for the account, kept for 30 days. */
  async startSession(account: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    this.sessions.set(token, { account, expires: Date.now() + SESSION_DAYS * 86_400_000 });
    await this.saveSessions();
    return token;
  }

  sessionAccount(token: string | undefined): Account | undefined {
    const session = token ? this.sessions.get(token) : undefined;
    if (!session || session.expires < Date.now()) return undefined;
    return this.get(session.account);
  }

  async endSession(token: string): Promise<void> {
    this.sessions.delete(token);
    await this.saveSessions();
  }

  private async saveSessions(): Promise<void> {
    const now = Date.now();
    for (const [token, s] of this.sessions) if (s.expires < now) this.sessions.delete(token);
    await writeJson(join(this.dir, 'sessions.json'), Object.fromEntries(this.sessions));
  }
}
