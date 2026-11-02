import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { readJson, readJsonDir, writeJson } from './json-files.ts';

// Accounts and sign-in sessions, kept as JSON in the server's data folder:
// accounts/<id>.json (a salted scrypt hash, never the password) and
// sessions.json. Self-hosted for friends, so there's no e-mail or recovery:
// the admin can delete an account file to reset it.

const hashPassword = promisify(scrypt) as (password: string, salt: string, length: number) => Promise<Buffer>;
const KEY_LENGTH = 64;
const SESSION_DAYS = 30;

const AccountFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  salt: z.string(),
  hash: z.string(),
  /** The first account on a server runs it: it sits at worlds as the GM. */
  admin: z.boolean().default(false),
  created: z.number(),
  /** The SHA-256 of the key Claude connects with (mcp-http.ts); none: no key. */
  mcpKey: z.string().optional(),
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

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

const publicAccount = ({ id, name, admin }: AccountFile): Account => ({ id, name, admin });

export class AccountStore {
  private accounts = new Map<string, AccountFile>();
  private sessions = new Map<string, z.infer<typeof SessionSchema>>();

  constructor(readonly dir: string) {}

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
    const salt = randomBytes(16).toString('base64url');
    const hash = (await hashPassword(input.password, salt, KEY_LENGTH)).toString('base64url');
    const name = input.name.trim().slice(0, 40) || input.username;
    const file: AccountFile = { id, name, salt, hash, admin: this.accounts.size === 0, created: Date.now() };
    this.accounts.set(id, file);
    await writeJson(join(this.dir, 'accounts', `${id}.json`), file);
    return publicAccount(file);
  }

  /** The account, if the password is right. */
  async login(username: string, password: string): Promise<Account | undefined> {
    const file = this.accounts.get(username.trim().toLowerCase());
    if (!file) return undefined;
    const hash = await hashPassword(password, file.salt, KEY_LENGTH);
    return timingSafeEqual(hash, Buffer.from(file.hash, 'base64url')) ? publicAccount(file) : undefined;
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

  /** A new key for Claude to sit at the account's seats with; it replaces the old one. Shown once. */
  async newMcpKey(id: string): Promise<string> {
    const key = `vtt_${randomBytes(24).toString('base64url')}`;
    await this.saveAccount(id, { mcpKey: sha256(key) });
    return key;
  }

  async dropMcpKey(id: string): Promise<void> {
    await this.saveAccount(id, { mcpKey: undefined });
  }

  hasMcpKey(id: string): boolean {
    return !!this.accounts.get(id)?.mcpKey;
  }

  /** The account a key belongs to. */
  mcpAccount(key: string): Account | undefined {
    const hash = sha256(key);
    const file = [...this.accounts.values()].find((a) => a.mcpKey === hash);
    return file && publicAccount(file);
  }

  private async saveAccount(id: string, patch: Partial<AccountFile>): Promise<void> {
    const old = this.accounts.get(id);
    if (!old) throw new AccountError('No such account.');
    const file = { ...old, ...patch };
    this.accounts.set(id, file);
    await writeJson(join(this.dir, 'accounts', `${id}.json`), file);
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
