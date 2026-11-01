import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type Character, characterIssues, characterOnMap, CharacterSchema } from '@vtt/system-dnd5e';
import { uniqueId } from '@vtt/shared';
import { z } from 'zod';
import { AccountError, type Account, type AccountStore } from './accounts.ts';
import type { CharacterStore } from './characters.ts';
import { HubError, type GameHub } from './game-hub.ts';
import type { GameStore } from './game-store.ts';
import {
  HttpError,
  parseBody,
  send,
  SESSION_COOKIE,
  sessionToken,
  signedIn,
  type Call,
  type Routes,
} from './http-json.ts';
import { LobbyRoutes } from './lobby-api.ts';

// The account side of the server, as JSON over HTTP: signing up and in, and
// the player's characters (the roster). Games are lobby-api.ts. The game
// itself then runs over the WebSocket, signed in by the same cookie.

export interface ApiDeps {
  accounts: AccountStore;
  characters: CharacterStore;
  hub: GameHub;
}

const sessionCookie = (token: string, maxAge: number) =>
  `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;

const Credentials = z.object({ username: z.string().max(64), password: z.string().max(200) });
const SignUp = Credentials.extend({ name: z.string().max(80).default('') });
/** What a client sends for a character: everything but who owns it and its id. */
const CharacterInput = CharacterSchema.omit({ id: true, owner: true });

/** Handles /api/ requests about accounts, characters and games; returns false for anything else. */
export function apiHandler(deps: ApiDeps): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const all: Routes[] = [new AccountRoutes(deps), new LobbyRoutes(deps)];
  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean).slice(1);
    const routes = all.find((r) => r.handles(parts[0]));
    if (!url.pathname.startsWith('/api/') || !routes) return false;
    const call: Call = { req, res, parts, method: req.method ?? 'GET', token: sessionToken(req) };
    try {
      await routes.serve(call);
    } catch (e) {
      if (e instanceof AccountError || e instanceof HubError) send(res, 400, { error: e.message });
      else if (e instanceof HttpError) send(res, e.status, { error: e.message, issues: e.issues });
      else throw e;
    }
    return true;
  };
}

class AccountRoutes implements Routes {
  constructor(private deps: ApiDeps) {}

  handles(route: string | undefined): boolean {
    return ['session', 'register', 'login', 'logout', 'characters'].includes(route ?? '');
  }

  async serve(call: Call): Promise<void> {
    const route = `${call.method} ${call.parts[0]}`;
    switch (route) {
      case 'GET session':
        return this.session(call);
      case 'POST register':
        return this.register(call);
      case 'POST login':
        return this.login(call);
      case 'POST logout':
        return this.logout(call);
      default:
        if (call.parts[0] === 'characters') return this.characters(call);
        throw new HttpError(405, 'Method not allowed.');
    }
  }

  private account(call: Call): Account {
    return signedIn(this.deps.accounts, call);
  }

  /** Who is signed in, and the server's home game (its name greets everyone on the main menu). */
  private async session(call: Call): Promise<void> {
    const account = this.deps.accounts.sessionAccount(call.token) ?? null;
    const id = this.deps.hub.homeId;
    const home = id ? await this.deps.hub.info(id) : undefined;
    send(call.res, 200, { account, home: home ? { id: home.id, name: home.name, rules: home.rules } : null });
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

  /** A fresh id from the character's name, unique among characters and the loaded games' actors. */
  private newId(): (name: string) => string {
    const suffix = randomBytes(2).toString('hex');
    const { characters, hub } = this.deps;
    const taken = (id: string) => characters.has(id) || hub.running().some(({ store }) => store.actors.has(id));
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
    for (const { store } of this.deps.hub.running()) updateOnMap(store, character);
    send(call.res, 200, { character });
  }
}

/** A saved (or levelled-up) character's tokens in a loaded game take its new build, keeping their play state. */
function updateOnMap(store: GameStore, character: Character): void {
  for (const scene of store.sceneIds()) {
    store.inScene(scene, () => {
      const token = store.tokens.get(character.id);
      if (token) store.setToken(characterOnMap(character, token, [token.x, token.y]));
    });
  }
}
