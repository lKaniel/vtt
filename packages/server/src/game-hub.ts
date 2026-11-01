import { randomBytes } from 'node:crypto';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { editionIn } from '@vtt/core';
import {
  DEFAULT_SYSTEM,
  type Game as GameFile,
  GameSchema,
  type NewGame,
  newGameIssues,
  type Player,
  uniqueId,
} from '@vtt/shared';
import type { WebSocket } from 'ws';
import { Game } from './game.ts';
import { GameIndex } from './game-index.ts';
import { GameStore } from './game-store.ts';
import { SYSTEMS } from './systems.ts';
import { readJson, writeJson } from './json-files.ts';
import { FORMAT } from './migrate-ownership.ts';
import { PackStore } from './pack-store.ts';

// Every game on the server. Games made in the lobby live in the data
// folder's games/<id>/; the game folder the server was started with (world/
// by default, where Claude edits by hand) stays where it is as the "home"
// game. A game is loaded when someone needs it and unloaded a while after
// its last player has left.

export interface HubOptions {
  /** Accounts, characters, games.json and games/. */
  dataDir: string;
  /** The game folder the server was started with. */
  home?: string;
  /** How long a game with nobody connected stays loaded. */
  idleMs?: number;
  /** Hot-reload hand edits to loaded games (off in tests). */
  watch?: boolean;
}

export interface Running {
  store: GameStore;
  game: Game;
  /** Who is connected. */
  sockets: Map<WebSocket, Player>;
}

/** Seats connected to a game, each once. */
const onlineIn = (running: Running | undefined) => [
  ...new Set([...(running?.sockets.values() ?? [])].map((p) => p.id)),
];

/** A game as the lobby lists it. */
export interface GameInfo {
  id: string;
  name: string;
  system: string;
  /** The game's rules edition (its system's default when game.json doesn't say). */
  rules: string;
  players: Player[];
  open: boolean;
  /** Seats connected now. */
  online: string[];
  lastPlayed?: number;
  invite?: string;
  /** The game the server was started with: it can't be deleted from the lobby. */
  home: boolean;
}

/** Something the lobby can't do, with the reason to show. */
export class HubError extends Error {}

const IDLE_MS = 5 * 60_000;

export class GameHub {
  /** Folder of each game. */
  private dirs = new Map<string, string>();
  private loading = new Map<string, Promise<Running>>();
  private live = new Map<string, Running>();
  private timers = new Map<string, NodeJS.Timeout>();
  private index: GameIndex;
  homeId?: string;
  /** The asset packs installed on the server: the data folder's packs/. */
  readonly packs: PackStore;

  constructor(private opts: HubOptions) {
    this.index = new GameIndex(opts.dataDir);
    this.packs = new PackStore(join(opts.dataDir, 'packs'));
  }

  private get gamesDir(): string {
    return join(this.opts.dataDir, 'games');
  }

  /** Finds the home game and every game folder in games/. */
  async load(): Promise<void> {
    await this.index.load();
    await this.packs.load();
    for (const problem of this.packs.problems) console.warn(`[packs] ${problem}`);
    if (this.opts.home) await this.loadHome(this.opts.home);
    const names = await readdir(this.gamesDir).catch(() => [] as string[]);
    for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
      const dir = join(this.gamesDir, name);
      const game = await readGameFile(dir);
      if (game && !this.dirs.has(game.id)) this.dirs.set(game.id, dir);
    }
  }

  private async loadHome(dir: string): Promise<void> {
    // An old world folder has no game.json yet: loading it migrates it.
    const id = (await readGameFile(dir))?.id ?? (await this.start(dir)).store.campaign.id;
    this.homeId = id;
    this.dirs.set(id, dir);
  }

  ids(): string[] {
    return [...this.dirs.keys()];
  }

  has(id: string): boolean {
    return this.dirs.has(id);
  }

  isRunning(id: string): boolean {
    return this.live.has(id);
  }

  /** The loaded games. */
  running(): Running[] {
    return [...this.live.values()];
  }

  /** The folder of a game's files, e.g. to serve its assets. */
  dirOf(id: string): string | undefined {
    return this.dirs.get(id);
  }

  /** The game, loaded if it isn't yet. It unloads again once idle. */
  async open(id: string): Promise<Running> {
    const live = this.live.get(id);
    if (live) {
      this.idle(id);
      return live;
    }
    const dir = this.dirs.get(id);
    if (!dir) throw new HubError('No such game.');
    const loading = this.loading.get(id) ?? this.start(dir);
    this.loading.set(id, loading);
    try {
      const running = await loading;
      this.live.set(id, running);
      this.idle(id);
      return running;
    } finally {
      this.loading.delete(id);
    }
  }

  private async start(dir: string): Promise<Running> {
    const file = await readGameFile(dir);
    const system = SYSTEMS.get(file?.system ?? DEFAULT_SYSTEM);
    if (!system) throw new HubError(`This server has no "${file?.system ?? ''}" system.`);
    const store = new GameStore(dir, system, this.packs);
    await store.load();
    if (this.opts.watch !== false) store.watch();
    return { store, game: new Game(store), sockets: new Map() };
  }

  /** Unloads the game after a while if nobody is connected (and keeps it while someone is). */
  private idle(id: string): void {
    clearTimeout(this.timers.get(id));
    if (this.live.get(id)?.sockets.size) return;
    const timer = setTimeout(() => void this.unload(id), this.opts.idleMs ?? IDLE_MS);
    timer.unref();
    this.timers.set(id, timer);
  }

  private async unload(id: string): Promise<void> {
    const running = this.live.get(id);
    clearTimeout(this.timers.get(id));
    if (!running) return;
    this.live.delete(id);
    running.store.close();
    await running.store.flush();
  }

  /** Puts a connection into a loaded game for `player`, and keeps the game loaded while it lasts. */
  connect(id: string, ws: WebSocket, player: Player): void {
    const running = this.live.get(id);
    if (!running) throw new HubError('That game is not loaded.');
    running.game.connect(ws, player);
    running.sockets.set(ws, player);
    clearTimeout(this.timers.get(id));
    void this.index.set(id, { lastPlayed: Date.now() });
    ws.on('close', () => {
      running.sockets.delete(ws);
      this.idle(id);
    });
  }

  async info(id: string): Promise<GameInfo> {
    const file = this.live.get(id)?.store.campaign ?? (await readGameFile(this.dirs.get(id) ?? ''));
    if (!file) throw new HubError('No such game.');
    const entry = this.index.get(id);
    return {
      id,
      name: file.name,
      system: file.system,
      rules: rulesOf(file),
      players: file.players,
      open: entry.open ?? id === this.homeId,
      online: onlineIn(this.live.get(id)),
      ...(entry.lastPlayed ? { lastPlayed: entry.lastPlayed } : {}),
      ...(entry.invite ? { invite: entry.invite } : {}),
      home: id === this.homeId,
    };
  }

  /** Makes a new game in games/<id>/ with `gm` in the only seat; returns its id. */
  async create(input: NewGame, gm: Player): Promise<string> {
    const issues = newGameIssues(input, SYSTEMS.infos());
    if (issues.length) throw new HubError(issues[0]);
    const id = uniqueId(input.name, (x) => this.dirs.has(x) || x === 'games');
    const dir = join(this.gamesDir, id);
    await writeNewGame(dir, { ...input, name: input.name.trim(), id }, gm);
    this.dirs.set(id, dir);
    await this.index.set(id, { lastPlayed: Date.now() });
    return id;
  }

  /** Deletes a game made in the lobby, files and all. */
  async remove(id: string): Promise<void> {
    if (id === this.homeId)
      throw new HubError('This is the game the server was started with: delete its folder by hand.');
    const dir = this.dirs.get(id);
    if (!dir) throw new HubError('No such game.');
    for (const ws of this.live.get(id)?.sockets.keys() ?? []) ws.close(4004, 'the game was deleted');
    await this.unload(id);
    this.dirs.delete(id);
    await this.index.remove(id);
    await rm(dir, { recursive: true, force: true });
  }

  /** Replaces the seats; a removed member is sent away and their fog deleted. */
  async setMembers(id: string, players: Player[]): Promise<void> {
    const { store } = await this.open(id);
    store.setGame({ players });
  }

  /** A fresh invite code; the previous link stops working. */
  async invite(id: string): Promise<string> {
    if (!this.dirs.has(id)) throw new HubError('No such game.');
    const code = randomBytes(9).toString('base64url');
    await this.index.set(id, { invite: code });
    return code;
  }

  byInvite(code: string): string | undefined {
    const id = this.index.byInvite(code);
    return id && this.dirs.has(id) ? id : undefined;
  }

  async setOpen(id: string, open: boolean): Promise<void> {
    if (!this.dirs.has(id)) throw new HubError('No such game.');
    await this.index.set(id, { open });
  }

  /** Unloads every game, once everything is on disk. */
  async close(): Promise<void> {
    await Promise.all([...this.live.keys()].map((id) => this.unload(id)));
    await this.index.flush();
  }
}

/** The edition a game plays: its own, else its system's default. */
function rulesOf(file: GameFile): string {
  const system = SYSTEMS.get(file.system);
  return system ? editionIn(system, file.rules) : (file.rules ?? '');
}

async function readGameFile(dir: string): Promise<GameFile | undefined> {
  const parsed = GameSchema.safeParse(await readJson(join(dir, 'game.json')));
  return parsed.success ? parsed.data : undefined;
}

/** A new game folder: game.json with one seat, and one empty scene. */
async function writeNewGame(dir: string, game: NewGame & { id: string }, gm: Player): Promise<void> {
  await mkdir(join(dir, 'assets'), { recursive: true });
  const file: GameFile = { ...game, format: FORMAT, scene: 'main', players: [gm] };
  await writeJson(join(dir, 'game.json'), file);
  await writeJson(join(dir, 'scenes/main/scene.json'), { name: 'Main', darkness: 0 });
}
