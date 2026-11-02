import type { SystemInfo } from '@vtt/core';
import { isGm } from './permissions.ts';
import type { Player, Role } from './schema.ts';

// Games on a server: what a new game needs, and changing who is in one. The
// lobby (server/lobby-api.ts) applies these; the client shows the same
// checks before it sends. Which systems a game can run on is up to the
// server: the SystemDefinitions it registered (server/systems.ts).

/** What games from before systems existed play. */
export const DEFAULT_SYSTEM = 'dnd5e';

export interface NewGame {
  name: string;
  system: string;
  /** One of the system's rules editions. */
  rules: string;
}

/** A Foundry VTT world brought in as a new game: what came along, and what didn't. */
export interface FoundryImportReport {
  name: string;
  scenes: number;
  actors: number;
  tokens: number;
  journals: number;
  tables: number;
  playlists: number;
  /** Pictures and sounds copied. */
  media: number;
  /** What could not come along, one line each. */
  skipped: string[];
}

/** Asking the server to import a Foundry world folder on its disk (the admin only). */
export interface FoundryImportInput {
  /** The world's folder, the one with world.json. */
  folder: string;
  /** The game's name; the world's title if missing. */
  name?: string;
  /** Foundry's Data folder, for files outside the world; found from the world's place if missing. */
  dataDir?: string;
}

/** What is wrong with a new game on a server with `systems`, if anything. */
export function newGameIssues(game: NewGame, systems: readonly SystemInfo[]): string[] {
  const issues: string[] = [];
  if (!game.name.trim()) issues.push('Give the game a name.');
  const system = systems.find((s) => s.id === game.system);
  if (!system) issues.push('Pick a system.');
  else if (!system.editions.some((e) => e.id === game.rules)) issues.push(`${system.name} has no ${game.rules} rules.`);
  return issues;
}

const SEAT_COLORS = ['#e0b040', '#5a9be0', '#5ac08a', '#d0605a', '#a070d0', '#40b8b8', '#d08a40', '#c070a0'];

/** A seat colour nobody at the game has yet (they repeat after eight). */
export function nextSeatColor(players: readonly Player[]): string {
  const used = new Set(players.map((p) => p.color));
  return SEAT_COLORS.find((c) => !used.has(c)) ?? SEAT_COLORS[players.length % SEAT_COLORS.length]!;
}

/** The seats once `member` has `role`, or is removed (null). A game always keeps a GM. */
export function membersAfter(players: readonly Player[], member: string, role: Role | null): Player[] {
  if (!players.some((p) => p.id === member)) throw new Error('That account is not a member of this game.');
  const next = players.flatMap((p) => {
    if (p.id !== member) return [p];
    return role ? [{ ...p, role }] : [];
  });
  if (!next.some(isGm)) throw new Error('A game needs a GM: make someone else GM first.');
  return next;
}

/** A game as the lobby lists it for one account. */
export interface GameSummary {
  id: string;
  name: string;
  system: string;
  /** The system's name, as the server that has it calls it. */
  systemName: string;
  rules: string;
  /** Your role there, or null when you have no seat yet. */
  you: Role | null;
  members: number;
  online: number;
  /** Every account on the server may join. */
  open: boolean;
  /** The game the server was started with. */
  home: boolean;
  lastPlayed?: number;
}

/** A game's page in the lobby: who is in it and, for its GMs, the invite code. */
export interface GameDetail extends GameSummary {
  players: (Pick<Player, 'id' | 'name' | 'role' | 'color'> & { online: boolean })[];
  invite?: string;
}
