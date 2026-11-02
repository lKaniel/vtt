import { type Character, characterOnMap, freeSquare } from '@vtt/system-dnd5e';
import {
  type GameDetail,
  type GameSummary,
  isGm,
  membersAfter,
  nextSeatColor,
  ownersOf,
  type Player,
  type Point,
  RoleSchema,
} from '@vtt/shared';
import { z } from 'zod';
import type { Account, AccountStore } from './accounts.ts';
import { SYSTEMS } from './systems.ts';
import type { CharacterStore } from './characters.ts';
import { serveArchive } from './archive-api.ts';
import type { GameAccess } from './game-access.ts';
import { MAX_ZIP } from './game-archive.ts';
import type { GameHub, GameInfo } from './game-hub.ts';
import type { GameStore } from './game-store.ts';
import { HttpError, parseBody, readRaw, send, signedIn, type Call, type Routes } from './http-json.ts';

// The lobby, as JSON over HTTP: the games an account can enter, making a
// game, invite links, members and their roles, and taking a seat with a
// roster character. Membership is the game's seats (game.json `players`):
// an account's seat has the account's id.

export interface LobbyDeps {
  accounts: AccountStore;
  characters: CharacterStore;
  hub: GameHub;
}

const NewGameInput = z.object({ name: z.string().max(80), system: z.string(), rules: z.string().min(1) });
const JoinInput = z.object({ character: z.string().optional() });
const RoleInput = z.object({ role: RoleSchema });
const OpenInput = z.object({ open: z.boolean() });
const ApprovalInput = z.object({ approval: z.boolean() });
const AnswerInput = z.object({ approve: z.boolean() });
const SeatPasswordInput = z.object({ password: z.string().max(200).nullable() });
const FoundryInput = z.object({
  folder: z.string().min(1).max(1000),
  name: z.string().max(80).optional(),
  dataDir: z.string().max(1000).optional(),
});

const seatOf = (info: GameInfo, account: Account) => info.players.find((p) => p.id === account.id);

function summary(info: GameInfo, account: Account): GameSummary {
  return {
    id: info.id,
    name: info.name,
    system: info.system,
    systemName: SYSTEMS.get(info.system)?.name ?? info.system,
    rules: info.rules,
    you: seatOf(info, account)?.role ?? null,
    members: info.players.length,
    online: info.online.length,
    open: info.open,
    home: info.home,
    ...(info.lastPlayed ? { lastPlayed: info.lastPlayed } : {}),
  };
}

function detail(info: GameInfo, account: Account, access: GameAccess): GameDetail {
  const seat = seatOf(info, account);
  const gm = !!seat && isGm(seat);
  const locked = new Set(access.lockedSeats(info.id));
  return {
    ...summary(info, account),
    players: info.players.map(({ id, name, role, color }) => ({
      id,
      name,
      role,
      color,
      online: info.online.includes(id),
      ...(locked.has(id) && { locked: true }),
    })),
    ...(gm && info.invite ? { invite: info.invite } : {}),
    ...(gm && { approval: info.approval, requests: access.requests(info.id) }),
  };
}

/** Members see their games, everyone sees open ones, and the admin sees them all. */
const canSeeGame = (info: GameInfo, account: Account) => !!seatOf(info, account) || info.open || account.admin;

export class LobbyRoutes implements Routes {
  constructor(private deps: LobbyDeps) {}

  handles(route: string | undefined): boolean {
    return route === 'games' || route === 'invites';
  }

  async serve(call: Call): Promise<void> {
    const account = signedIn(this.deps.accounts, call);
    const [, id, sub] = call.parts;
    const top = this.topLevel(call, account);
    if (top || !id) return top;
    const info = await this.visible(id, account);
    switch (`${call.method} ${sub ?? ''}`) {
      case 'GET ':
        send(call.res, 200, { game: detail(info, account, this.deps.hub.access) });
        return;
      case 'DELETE ':
        return this.remove(call, info, account);
      case 'POST join':
        return this.join(call, info, account);
      case 'POST invite':
        return this.invite(call, info, account);
      case 'PUT open':
        return this.setOpen(call, info, account);
      case 'PUT approval':
        return this.setApproval(call, info, account);
      default:
        return this.byPath(call, info, account);
    }
  }

  /** Calls on a game's requests and members, which carry an id in the path. */
  private byPath(call: Call, info: GameInfo, account: Account): Promise<void> {
    const [, , sub, , extra] = call.parts;
    if (sub === 'requests') return this.answer(call, info, account);
    if (sub === 'backups' || sub === 'export') return this.archive(call, info, account);
    if (sub === 'members' && extra === 'password') return this.seatPassword(call, info, account);
    if (sub === 'members') return this.member(call, info, account);
    throw new HttpError(405, 'Method not allowed.');
  }

  /** Calls that aren't about one game: the list, a new game, an import, an invite. */
  private topLevel(call: Call, account: Account): Promise<void> | undefined {
    const [route, id] = call.parts;
    if (route === 'invites' && call.method === 'POST') return this.accept(call, account, id ?? '');
    if (!id) return this.games(call, account);
    if (id === 'import-foundry' && call.method === 'POST') return this.importFoundry(call, account);
    if (id === 'import-zip' && call.method === 'POST') return this.importZip(call, account);
    return undefined;
  }

  private async games(call: Call, account: Account): Promise<void> {
    if (call.method === 'POST') return this.create(call, account);
    if (call.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
    const all = await Promise.all(this.deps.hub.ids().map((id) => this.deps.hub.info(id)));
    const games = all.filter((g) => canSeeGame(g, account)).map((g) => summary(g, account));
    send(call.res, 200, { games, systems: SYSTEMS.infos() });
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

  /** A new game from a Foundry world folder on the server: the admin's, since it reads the server's disk. */
  private async importFoundry(call: Call, account: Account): Promise<void> {
    if (!account.admin) throw new HttpError(403, "Only the server's admin can import from its disk.");
    const input = await parseBody(call.req, FoundryInput);
    const gm: Player = { id: account.id, name: account.name, role: 'gm', color: nextSeatColor([]) };
    const { id, report } = await this.deps.hub.importFoundry(input.folder.trim(), gm, input);
    send(call.res, 200, { game: summary(await this.deps.hub.info(id), account), report });
  }

  /** A new game from a zip a GM exported, with the caller as its GM. */
  private async importZip(call: Call, account: Account): Promise<void> {
    const gm: Player = { id: account.id, name: account.name, role: 'gm', color: nextSeatColor([]) };
    const id = await this.deps.hub.importZip(await readRaw(call.req, MAX_ZIP), gm);
    send(call.res, 200, { game: summary(await this.deps.hub.info(id), account) });
  }

  private archive(call: Call, info: GameInfo, account: Account): Promise<void> {
    this.requireGm(info, account);
    return serveArchive(this.deps.hub, call, info);
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

  private async setApproval(call: Call, info: GameInfo, account: Account): Promise<void> {
    this.requireGm(info, account);
    const { approval } = await parseBody(call.req, ApprovalInput);
    await this.deps.hub.access.setApproval(info.id, approval);
    send(call.res, 200, {});
  }

  /** GM: lets an account that asked to join in (as a player), or turns it down. */
  private async answer(call: Call, info: GameInfo, account: Account): Promise<void> {
    this.requireGm(info, account);
    if (call.method !== 'POST') throw new HttpError(405, 'Method not allowed.');
    const { approve } = await parseBody(call.req, AnswerInput);
    const asked = await this.deps.hub.access.answer(info.id, call.parts[3] ?? '');
    if (!asked) throw new HttpError(404, 'No such request.');
    const joining = approve && this.deps.accounts.get(asked.id);
    if (joining) seat((await this.deps.hub.open(info.id)).store, joining, 'player');
    send(call.res, 200, {});
  }

  /** GM: a password on a seat taken without an account, or (null) none. */
  private async seatPassword(call: Call, info: GameInfo, account: Account): Promise<void> {
    this.requireGm(info, account);
    if (call.method !== 'PUT') throw new HttpError(405, 'Method not allowed.');
    const member = call.parts[3] ?? '';
    if (!info.players.some((p) => p.id === member)) throw new HttpError(404, 'No such seat.');
    const { password } = await parseBody(call.req, SeatPasswordInput);
    await this.deps.hub.access.setSeatKey(info.id, member, password === '' ? null : password);
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
    if (this.mustAsk(id, store, account)) return this.ask(call, id, account);
    send(call.res, 200, { game: id, player: seat(store, account, 'player') });
  }

  /** Joining asks the GM: the game wants approval and the account has no seat yet. */
  private mustAsk(id: string, store: GameStore, account: Account): boolean {
    return this.deps.hub.access.needsApproval(id) && !store.world.players.some((p) => p.id === account.id);
  }

  private async ask(call: Call, id: string, account: Account): Promise<void> {
    await this.deps.hub.access.request(id, account);
    send(call.res, 200, { game: id, pending: true });
  }

  /** Takes the account's seat, bringing a roster character onto the map if one is picked. */
  private async join(call: Call, info: GameInfo, account: Account): Promise<void> {
    const { character: cid } = await parseBody(call.req, JoinInput);
    const character = cid ? this.deps.characters.owned(cid, account.id) : undefined;
    if (cid && !character) throw new HttpError(404, 'No such character.');
    if (!seatOf(info, account) && !info.open) throw new HttpError(403, 'Ask the GM for an invite link.');
    const { store } = await this.deps.hub.open(info.id);
    if (!account.admin && this.mustAsk(info.id, store, account)) return this.ask(call, info.id, account);
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
