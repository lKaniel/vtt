import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  characterIssues,
  characterOnMap,
  CharacterSchema,
  freeSquare,
  ownersOf,
  uniqueId,
  type Character,
  type Player,
  type Point,
} from '@vtt/shared';
import { z } from 'zod';
import { AccountError, type Account, type AccountStore } from './accounts.ts';
import type { CharacterStore } from './characters.ts';
import type { GameStore } from './game-store.ts';

// The account side of the server, as JSON over HTTP: signing up and in, the
// player's characters, and taking a seat at the world with one of them. The
// game itself then runs over the WebSocket, signed in by the same cookie.

const SESSION_COOKIE = 'vtt_session';
const MAX_BODY = 256 * 1024;

export interface ApiDeps {
  accounts: AccountStore;
  characters: CharacterStore;
  world: GameStore;
}

interface Call {
  req: IncomingMessage;
  res: ServerResponse;
  /** Path parts after /api/. */
  parts: string[];
  method: string;
  token?: string;
}

/** A request that can't be served, with the status and message to answer it with. */
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: string[],
  ) {
    super(message);
  }
}

/**
 * Who a WebSocket upgrade is for: `?player=` picks one of the world's seats,
 * otherwise the signed-in account joins as itself (once it has a seat).
 */
export function upgradePlayer(
  req: IncomingMessage,
  accounts: Pick<AccountStore, 'sessionAccount'>,
  findPlayer: (id: string) => Player | undefined,
): Player | undefined {
  const seat = new URL(req.url ?? '/', 'http://localhost').searchParams.get('player');
  return findPlayer(seat ?? accounts.sessionAccount(sessionToken(req))?.id ?? '');
}

/** Reads the session token from a request's cookies. */
function sessionToken(req: IncomingMessage): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) return value.join('=');
  }
  return undefined;
}

function send(res: ServerResponse, status: number, body: unknown, cookie?: string): void {
  res.writeHead(status, { 'content-type': 'application/json', ...(cookie ? { 'set-cookie': cookie } : {}) });
  res.end(JSON.stringify(body));
}

const sessionCookie = (token: string, maxAge: number) =>
  `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;

async function readBody(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request too large.');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return text ? (JSON.parse(text) as unknown) : {};
  } catch {
    throw new HttpError(400, 'Send JSON.');
  }
}

async function parseBody<T>(req: IncomingMessage, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await readBody(req));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join('; '));
  return parsed.data;
}

const Credentials = z.object({ username: z.string().max(64), password: z.string().max(200) });
const SignUp = Credentials.extend({ name: z.string().max(80).default('') });
const Join = z.object({ character: z.string().optional() });
/** What a client sends for a character: everything but who owns it and its id. */
const CharacterInput = CharacterSchema.omit({ id: true, owner: true });

/** Handles /api/ requests about accounts; returns false for anything else. */
export function accountApi(deps: ApiDeps): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const routes = new Routes(deps);
  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean).slice(1);
    if (!url.pathname.startsWith('/api/') || !routes.handles(parts[0])) return false;
    const call: Call = { req, res, parts, method: req.method ?? 'GET', token: sessionToken(req) };
    try {
      await routes.serve(call);
    } catch (e) {
      if (e instanceof AccountError) send(res, 400, { error: e.message });
      else if (e instanceof HttpError) send(res, e.status, { error: e.message, issues: e.issues });
      else throw e;
    }
    return true;
  };
}

class Routes {
  constructor(private deps: ApiDeps) {}

  handles(route: string | undefined): boolean {
    return ['session', 'register', 'login', 'logout', 'characters', 'join'].includes(route ?? '');
  }

  async serve(call: Call): Promise<void> {
    const route = `${call.method} ${call.parts[0]}`;
    switch (route) {
      case 'GET session':
        this.session(call);
        return;
      case 'POST register':
        return this.register(call);
      case 'POST login':
        return this.login(call);
      case 'POST logout':
        return this.logout(call);
      case 'POST join':
        return this.join(call);
      default:
        if (call.parts[0] === 'characters') return this.characters(call);
        throw new HttpError(405, 'Method not allowed.');
    }
  }

  private account(call: Call): Account {
    const account = this.deps.accounts.sessionAccount(call.token);
    if (!account) throw new HttpError(401, 'Sign in first.');
    return account;
  }

  private session(call: Call): void {
    const account = this.deps.accounts.sessionAccount(call.token) ?? null;
    const { name, rules } = this.deps.world.world;
    const seat = account && this.deps.world.world.players.find((p) => p.id === account.id);
    send(call.res, 200, { account, world: { name, rules }, seat: seat ?? null });
  }

  private async register(call: Call): Promise<void> {
    const input = await parseBody(call.req, SignUp);
    const account = await this.deps.accounts.register(input);
    await this.signIn(call, account);
  }

  private async login(call: Call): Promise<void> {
    const { username, password } = await parseBody(call.req, Credentials);
    const account = await this.deps.accounts.login(username, password);
    if (!account) throw new HttpError(401, 'Wrong username or password.');
    await this.signIn(call, account);
  }

  private async signIn(call: Call, account: Account): Promise<void> {
    const token = await this.deps.accounts.startSession(account.id);
    send(call.res, 200, { account }, sessionCookie(token, 30 * 86_400));
  }

  private async logout(call: Call): Promise<void> {
    if (call.token) await this.deps.accounts.endSession(call.token);
    send(call.res, 200, {}, sessionCookie('', 0));
  }

  private async characters(call: Call): Promise<void> {
    const account = this.account(call);
    const id = call.parts[1];
    if (call.method === 'GET' && !id) {
      send(call.res, 200, { characters: this.deps.characters.listFor(account.id) });
      return;
    }
    if (call.method === 'POST' && !id) return this.saveCharacter(call, account, this.newId());
    const owned = id && this.deps.characters.owned(id, account.id);
    if (!owned) throw new HttpError(404, 'No such character.');
    if (call.method === 'PUT') return this.saveCharacter(call, account, owned.id);
    if (call.method === 'DELETE') {
      await this.deps.characters.remove(owned.id);
      send(call.res, 200, {});
      return;
    }
    throw new HttpError(405, 'Method not allowed.');
  }

  /** A fresh id from the character's name, unique among characters and the game's tokens and actors. */
  private newId(): (name: string) => string {
    const suffix = randomBytes(2).toString('hex');
    const { characters, world } = this.deps;
    const taken = (id: string) => characters.has(id) || world.tokens.has(id) || world.actors.has(id);
    return (name) => uniqueId(`${name} ${suffix}`, taken);
  }

  private async saveCharacter(call: Call, account: Account, id: string | ((name: string) => string)): Promise<void> {
    const input = await parseBody(call.req, CharacterInput);
    const character: Character = {
      ...input,
      id: typeof id === 'string' ? id : id(input.name),
      owner: account.id,
    };
    const issues = characterIssues(character);
    if (issues.length) throw new HttpError(400, issues[0]!, issues);
    await this.deps.characters.save(character);
    const token = this.deps.world.tokens.get(character.id);
    if (token) this.deps.world.setToken(characterOnMap(character, token, [token.x, token.y]));
    send(call.res, 200, { character });
  }

  private async join(call: Call): Promise<void> {
    const account = this.account(call);
    const { character: id } = await parseBody(call.req, Join);
    const character = id ? this.deps.characters.owned(id, account.id) : undefined;
    if (id && !character) throw new HttpError(404, 'No such character.');
    const player = this.seat(account);
    if (character) this.place(character);
    send(call.res, 200, { player });
  }

  /** The account's seat at the world, added on first join. The admin sits as the GM. */
  private seat(account: Account): Player {
    const world = this.deps.world;
    const seated = world.world.players.find((p) => p.id === account.id);
    if (seated) return seated;
    const player: Player = {
      id: account.id,
      name: account.name,
      role: account.admin ? 'gm' : 'player',
      color: '#8a8a8a',
    };
    world.addPlayer(player);
    return player;
  }

  private place(c: Character): void {
    const world = this.deps.world;
    const existing = world.tokens.get(c.id);
    if (existing && !ownersOf(existing).includes(c.owner)) {
      throw new HttpError(409, 'A creature on the map already uses that name.');
    }
    const taken: Point[] = [...world.tokens.values()].map((t) => [t.x, t.y]);
    const at = freeSquare(world.world.start, taken, world.world.gridSize);
    world.setToken(characterOnMap(c, existing, at));
  }
}
