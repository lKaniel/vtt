import {
  FIRST_GM,
  type GameDetail,
  type GameSummary,
  isGm,
  membersAfter,
  newPlayerIssues,
  nextSeatColor,
  type Player,
  RoleSchema,
  uniqueId,
} from '@vtt/shared';
import { z } from 'zod';
import { serveArchive } from './archive-api.ts';
import { CharacterRoutes } from './character-api.ts';
import type { CharacterStore } from '../library/characters.ts';
import { MAX_ZIP } from '../library/game-archive.ts';
import type { GameHub, GameInfo } from '../library/game-hub.ts';
import { ensureSession, HttpError, parseBody, readRaw, send, type Call, type Routes } from './http-json.ts';
import type { SessionStore } from './sessions.ts';
import { SYSTEMS } from '../systems.ts';

// The games, as JSON over HTTP, Foundry style. Everyone sees the list of
// games and each game's players; you join a game by picking a player in it
// (with that player's password, if it has one), and your browser's session
// remembers it. The server's admin (who gave the admin password: Setup)
// makes, imports and deletes games; a game's GM and the admin manage its
// players, backups and files. A game's players are its seats (game.json
// `players`).

export interface LobbyDeps {
  sessions: SessionStore;
  characters: CharacterStore;
  hub: GameHub;
}

/** A game call: the game, the player this browser joined it as, and whether it may manage it. */
export interface GameCall {
  call: Call;
  info: GameInfo;
  seat?: Player;
  manage: boolean;
}

const NewGameInput = z.object({ name: z.string().max(80), system: z.string(), rules: z.string().min(1) });
const JoinInput = z.object({ player: z.string(), password: z.string().max(200).default('') });
const NewPlayerInput = z.object({
  name: z.string().max(80),
  role: RoleSchema.default('player'),
  password: z.string().max(200).optional(),
});
const RoleInput = z.object({ role: RoleSchema });
const PasswordInput = z.object({ password: z.string().max(200).nullable() });
const FoundryAgainInput = z.object({
  folder: z.string().max(1000).optional(),
  dataDir: z.string().max(1000).optional(),
});
const FoundryInput = z.object({
  folder: z.string().min(1).max(1000),
  name: z.string().max(80).optional(),
  dataDir: z.string().max(1000).optional(),
});

function summary(info: GameInfo, seat: Player | undefined): GameSummary {
  return {
    id: info.id,
    name: info.name,
    system: info.system,
    systemName: SYSTEMS.get(info.system)?.name ?? info.system,
    rules: info.rules,
    you: seat?.role ?? null,
    members: info.players.length,
    online: info.online.length,
    home: info.home,
    ...(info.lastPlayed ? { lastPlayed: info.lastPlayed } : {}),
  };
}

export class LobbyRoutes implements Routes {
  private characterRoutes: CharacterRoutes;

  constructor(private deps: LobbyDeps) {
    this.characterRoutes = new CharacterRoutes(deps);
  }

  handles(route: string | undefined): boolean {
    return route === 'games';
  }

  async serve(call: Call): Promise<void> {
    const [, id] = call.parts;
    if (!id) return this.games(call);
    if (call.method === 'POST' && id === 'import-foundry') return this.importFoundry(call);
    if (call.method === 'POST' && id === 'import-zip') return this.importZip(call);
    return this.game(await this.gameCall(call, id));
  }

  private async gameCall(call: Call, id: string): Promise<GameCall> {
    if (!this.deps.hub.has(id)) throw new HttpError(404, 'No such game.');
    const info = await this.deps.hub.info(id);
    const seat = this.seatOf(info, call);
    return { call, info, seat, manage: this.isAdmin(call) || (!!seat && isGm(seat)) };
  }

  private seatOf(info: GameInfo, call: Call): Player | undefined {
    const id = this.deps.sessions.seatIn(call.token, info.id);
    return id ? info.players.find((p) => p.id === id) : undefined;
  }

  private isAdmin(call: Call): boolean {
    return this.deps.sessions.isAdmin(call.token);
  }

  private requireAdmin(call: Call): void {
    if (!this.isAdmin(call)) throw new HttpError(403, 'Only the server admin can do that: give the admin password.');
  }

  private game(g: GameCall): Promise<void> {
    const { call } = g;
    const sub = call.parts[2] ?? '';
    switch (`${call.method} ${sub}`) {
      case 'GET ':
        send(call.res, 200, { game: this.detail(g) });
        return Promise.resolve();
      case 'DELETE ':
        return this.remove(g);
      case 'POST join':
        return this.join(g);
      case 'POST leave':
        return this.leave(g);
      default:
        return this.byPath(g, sub);
    }
  }

  private byPath(g: GameCall, sub: string): Promise<void> {
    if (sub === 'players') return this.players(g);
    if (sub === 'backups' || sub === 'export') return this.archive(g);
    if (sub === 'reimport-foundry' && g.call.method === 'POST') return this.reimportFoundry(g);
    if (this.characterRoutes.handles(sub)) return this.characterRoutes.serve(g);
    throw new HttpError(405, 'Method not allowed.');
  }

  private detail({ info, seat, manage }: GameCall): GameDetail {
    const locked = new Set(this.deps.hub.access.locked(info.id));
    return {
      ...summary(info, seat),
      players: info.players.map(({ id, name, role, color }) => ({
        id,
        name,
        role,
        color,
        online: info.online.includes(id),
        ...(locked.has(id) && { locked: true }),
      })),
      ...(seat && { me: seat.id }),
      manage,
    };
  }

  /** Every game on the server, and the systems a new one can use. */
  private async games(call: Call): Promise<void> {
    if (call.method === 'POST') return this.create(call);
    if (call.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
    const all = await Promise.all(this.deps.hub.ids().map((id) => this.deps.hub.info(id)));
    const games = all.map((g) => summary(g, this.seatOf(g, call)));
    send(call.res, 200, { games, systems: SYSTEMS.infos() });
  }

  /** Admin: a new game, with a Gamemaster player this browser joins as. */
  private async create(call: Call): Promise<void> {
    this.requireAdmin(call);
    const input = await parseBody(call.req, NewGameInput);
    const id = await this.deps.hub.create(input, FIRST_GM);
    await this.made(call, id);
  }

  /** A game Setup just made: this browser sits as its GM, and gets its summary. */
  private async made(call: Call, id: string, extra: object = {}): Promise<void> {
    const token = await ensureSession(this.deps.sessions, call);
    const info = await this.deps.hub.info(id);
    const gm = info.players.find(isGm);
    if (gm) await this.deps.sessions.sit(token, id, gm.id);
    send(call.res, 200, { game: summary(info, gm), ...extra });
  }

  /** Admin: a new game from a Foundry world folder on the server's disk. */
  private async importFoundry(call: Call): Promise<void> {
    this.requireAdmin(call);
    const input = await parseBody(call.req, FoundryInput);
    const { id, report } = await this.deps.hub.importFoundry(input.folder.trim(), FIRST_GM, input);
    await this.made(call, id, { report });
  }

  /** Admin: the Foundry world a game was made from, imported again into it; everyone reconnects. */
  private async reimportFoundry({ call, info }: GameCall): Promise<void> {
    this.requireAdmin(call);
    const input = await parseBody(call.req, FoundryAgainInput);
    const report = await this.deps.hub.reimportFoundry(info.id, FIRST_GM, input);
    send(call.res, 200, { report });
  }

  /** Admin: a new game from a zip a GM exported. */
  private async importZip(call: Call): Promise<void> {
    this.requireAdmin(call);
    const id = await this.deps.hub.importZip(await readRaw(call.req, MAX_ZIP), FIRST_GM);
    await this.made(call, id);
  }

  private archive(g: GameCall): Promise<void> {
    this.requireManage(g);
    return serveArchive(this.deps.hub, g.call, g.info);
  }

  private requireManage(g: GameCall): void {
    if (!g.manage) throw new HttpError(403, 'Only the GM can do that.');
  }

  private async remove({ call, info }: GameCall): Promise<void> {
    this.requireAdmin(call);
    await this.deps.hub.remove(info.id);
    await this.deps.sessions.forget(info.id);
    send(call.res, 200, {});
  }

  /** Joins the game as one of its players, with that player's password if it has one. */
  private async join({ call, info }: GameCall): Promise<void> {
    const { player: id, password } = await parseBody(call.req, JoinInput);
    const player = info.players.find((p) => p.id === id);
    if (!player) throw new HttpError(404, 'That game has no such player.');
    if (!(await this.deps.hub.access.opens(info.id, id, password))) {
      throw new HttpError(403, password ? 'Wrong password.' : `${player.name} has a password.`);
    }
    const shared = isGm(player);
    if (!shared && this.deps.hub.heldElsewhere(info.id, id, call.token)) {
      throw new HttpError(409, `${player.name} is already playing from another browser.`);
    }
    const token = await ensureSession(this.deps.sessions, call);
    if (!shared) await this.deps.sessions.forget(info.id, id, token);
    await this.deps.sessions.sit(token, info.id, id);
    send(call.res, 200, { player });
  }

  private async leave({ call, info }: GameCall): Promise<void> {
    if (call.token && this.deps.sessions.get(call.token)) await this.deps.sessions.leave(call.token, info.id);
    send(call.res, 200, {});
  }

  /** The GM adds, changes and removes players; anyone sets their own password. */
  private players(g: GameCall): Promise<void> {
    const [, , , player, extra] = g.call.parts;
    if (!player && g.call.method === 'POST') return this.addPlayer(g);
    if (player && extra === 'password') return this.password(g, player);
    if (player && !extra) return this.changePlayer(g, player);
    throw new HttpError(405, 'Method not allowed.');
  }

  private async addPlayer(g: GameCall): Promise<void> {
    this.requireManage(g);
    const input = await parseBody(g.call.req, NewPlayerInput);
    const issues = newPlayerIssues(input.name, g.info.players);
    if (issues.length) throw new HttpError(400, issues[0]!);
    const players = g.info.players;
    const taken = (x: string) => players.some((p) => p.id === x);
    const player: Player = {
      id: uniqueId(input.name, taken),
      name: input.name.trim(),
      role: input.role,
      color: nextSeatColor(players),
    };
    const { store } = await this.deps.hub.open(g.info.id);
    store.addPlayer(player);
    if (input.password) await this.deps.hub.access.setPassword(g.info.id, player.id, input.password);
    send(g.call.res, 200, { player });
  }

  /** Changes a player's role, or removes them (their characters stay in the game as actors). */
  private async changePlayer(g: GameCall, member: string): Promise<void> {
    const { call } = g;
    if (call.method !== 'PUT' && call.method !== 'DELETE') throw new HttpError(405, 'Method not allowed.');
    this.requireManage(g);
    const role = call.method === 'PUT' ? (await parseBody(call.req, RoleInput)).role : null;
    let players: Player[];
    try {
      players = membersAfter(g.info.players, member, role);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    await this.deps.hub.setMembers(g.info.id, players);
    if (!role) await this.deps.sessions.forget(g.info.id, member);
    send(call.res, 200, {});
  }

  /** A password on a player, or (null) none: the GM's, or your own. */
  private async password(g: GameCall, member: string): Promise<void> {
    if (g.call.method !== 'PUT') throw new HttpError(405, 'Method not allowed.');
    if (g.seat?.id !== member) this.requireManage(g);
    if (!g.info.players.some((p) => p.id === member)) throw new HttpError(404, 'That game has no such player.');
    const { password } = await parseBody(g.call.req, PasswordInput);
    await this.deps.hub.access.setPassword(g.info.id, member, password === '' ? null : password);
    send(g.call.res, 200, {});
  }
}
