import {
  EditionSchema,
  freeSquare,
  isGm,
  membersAfter,
  nextSeatColor,
  ownersOf,
  RoleSchema,
  type Character,
  type GameDetail,
  type GameSummary,
  type Player,
  type Point,
  SYSTEMS,
} from '@vtt/shared';
import { characterOnMap } from '@vtt/shared';
import { z } from 'zod';
import type { Account, AccountStore } from './accounts.ts';
import type { CharacterStore } from './characters.ts';
import type { GameHub, GameInfo } from './game-hub.ts';
import type { GameStore } from './game-store.ts';
import { HttpError, parseBody, send, signedIn, type Call } from './http-json.ts';

// The lobby, as JSON over HTTP: the games an account can enter, making a
// game, invite links, members and their roles, and taking a seat with a
// roster character. Membership is the game's seats (game.json `players`):
// an account's seat has the account's id.

export interface LobbyDeps {
  accounts: AccountStore;
  characters: CharacterStore;
  hub: GameHub;
}

const NewGameInput = z.object({ name: z.string().max(80), system: z.string(), rules: EditionSchema });
const JoinInput = z.object({ character: z.string().optional() });
const RoleInput = z.object({ role: RoleSchema });
const OpenInput = z.object({ open: z.boolean() });

const seatOf = (info: GameInfo, account: Account) => info.players.find((p) => p.id === account.id);

function summary(info: GameInfo, account: Account): GameSummary {
  return {
    id: info.id,
    name: info.name,
    system: info.system,
    rules: info.rules,
    you: seatOf(info, account)?.role ?? null,
    members: info.players.length,
    online: info.online.length,
    open: info.open,
    home: info.home,
    ...(info.lastPlayed ? { lastPlayed: info.lastPlayed } : {}),
  };
}

function detail(info: GameInfo, account: Account): GameDetail {
  const seat = seatOf(info, account);
  return {
    ...summary(info, account),
    players: info.players.map(({ id, name, role, color }) => ({ id, name, role, color, online: info.online.includes(id) })),
    ...(seat && isGm(seat) && info.invite ? { invite: info.invite } : {}),
  };
}

/** Members see their games, everyone sees open ones, and the admin sees them all. */
const canSeeGame = (info: GameInfo, account: Account) => !!seatOf(info, account) || info.open || account.admin;

export class LobbyRoutes {
  constructor(private deps: LobbyDeps) {}

  handles(route: string | undefined): boolean {
    return route === 'games' || route === 'invites';
  }

  async serve(call: Call): Promise<void> {
    const account = signedIn(this.deps.accounts, call);
    const [route, id, sub] = call.parts;
    if (route === 'invites' && call.method === 'POST') return this.accept(call, account, id ?? '');
    if (!id) return this.games(call, account);
    const info = await this.visible(id, account);
    switch (`${call.method} ${sub ?? ''}`) {
      case 'GET ':
        return send(call.res, 200, { game: detail(info, account) });
      case 'DELETE ':
        return this.remove(call, info, account);
      case 'POST join':
        return this.join(call, info, account);
      case 'POST invite':
        return this.invite(call, info, account);
      case 'PUT open':
        return this.setOpen(call, info, account);
      default:
        if (sub === 'members') return this.member(call, info, account);
        throw new HttpError(405, 'Method not allowed.');
    }
  }

  private async games(call: Call, account: Account): Promise<void> {
    if (call.method === 'POST') return this.create(call, account);
    if (call.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
    const all = await Promise.all(this.deps.hub.ids().map((id) => this.deps.hub.info(id)));
    const games = all.filter((g) => canSeeGame(g, account)).map((g) => summary(g, account));
    send(call.res, 200, { games, systems: SYSTEMS });
  }

  private async visible(id: string, account: Account): Promise<GameInfo> {
    const info = this.deps.hub.has(id) ? await this.deps.hub.info(id) : undefined;
    if (!info || !canSeeGame(info, account)) throw new HttpError(404, 'No such game.');
    return info;
  }

  private requireGm(info: GameInfo, account: Account): void {
    const seat = seatOf(info, account);
    if (!seat || !isGm(seat)) throw new HttpError(403, 'Only the GM can do that.');
  }

  private async create(call: Call, account: Account): Promise<void> {
    const input = await parseBody(call.req, NewGameInput);
    const gm: Player = { id: account.id, name: account.name, role: 'gm', color: nextSeatColor([]) };
    const id = await this.deps.hub.create(input, gm);
    send(call.res, 200, { game: summary(await this.deps.hub.info(id), account) });
  }

  private async remove(call: Call, info: GameInfo, account: Account): Promise<void> {
    if (!account.admin) this.requireGm(info, account);
    await this.deps.hub.remove(info.id);
    send(call.res, 200, {});
  }

  private async invite(call: Call, info: GameInfo, account: Account): Promise<void> {
    this.requireGm(info, account);
    send(call.res, 200, { invite: await this.deps.hub.invite(info.id) });
  }

  private async setOpen(call: Call, info: GameInfo, account: Account): Promise<void> {
    this.requireGm(info, account);
    const { open } = await parseBody(call.req, OpenInput);
    await this.deps.hub.setOpen(info.id, open);
    send(call.res, 200, {});
  }

  /** Changes a member's role, or removes them. Anyone may leave; the rest is the GM's. */
  private async member(call: Call, info: GameInfo, account: Account): Promise<void> {
    const member = call.parts[3] ?? '';
    if (call.method !== 'PUT' && call.method !== 'DELETE') throw new HttpError(405, 'Method not allowed.');
    if (call.method === 'PUT' || member !== account.id) this.requireGm(info, account);
    const role = call.method === 'PUT' ? (await parseBody(call.req, RoleInput)).role : null;
    let players: Player[];
    try {
      players = membersAfter(info.players, member, role);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    await this.deps.hub.setMembers(info.id, players);
    send(call.res, 200, {});
  }

  /** Joins by an invite link: the account gets a player's seat. */
  private async accept(call: Call, account: Account, code: string): Promise<void> {
    const id = this.deps.hub.byInvite(code);
    if (!id) throw new HttpError(404, 'This invite link is old or wrong: ask the GM for a new one.');
    const { store } = await this.deps.hub.open(id);
    send(call.res, 200, { game: id, player: seat(store, account, 'player') });
  }

  /** Takes the account's seat, bringing a roster character onto the map if one is picked. */
  private async join(call: Call, info: GameInfo, account: Account): Promise<void> {
    const { character: cid } = await parseBody(call.req, JoinInput);
    const character = cid ? this.deps.characters.owned(cid, account.id) : undefined;
    if (cid && !character) throw new HttpError(404, 'No such character.');
    if (!seatOf(info, account) && !info.open) throw new HttpError(403, 'Ask the GM for an invite link.');
    const { store } = await this.deps.hub.open(info.id);
    // The server's admin runs the home game, as before games had a lobby.
    const player = seat(store, account, account.admin && info.home ? 'gm' : 'player');
    if (character) place(store, character);
    send(call.res, 200, { player });
  }
}

/** The account's seat at the game, added with `role` the first time. */
function seat(store: GameStore, account: Account, role: Player['role']): Player {
  const players = store.world.players;
  const seated = players.find((p) => p.id === account.id);
  if (seated) return seated;
  const player: Player = { id: account.id, name: account.name, role, color: nextSeatColor(players) };
  store.addPlayer(player);
  return player;
}

/** Puts a roster character on the map as a linked actor the player owns, or updates the one there. */
function place(store: GameStore, c: Character): void {
  const existing = store.tokens.get(c.id);
  if (existing && !ownersOf(existing).includes(c.owner)) {
    throw new HttpError(409, 'A creature on the map already uses that name.');
  }
  const taken: Point[] = [...store.tokens.values()].map((t) => [t.x, t.y]);
  const at = freeSquare(store.world.start, taken, store.world.gridSize);
  store.setToken(characterOnMap(c, existing, at));
}
