import { isGm } from './permissions.ts';
import type { Player, Role } from './schema.ts';
import type { Edition } from './stats-schema.ts';

// Games on a server: the systems a game can run on, what a new game needs,
// and changing who is in one. The lobby (server/lobby-api.ts) applies these;
// the client shows the same checks before it sends.

export interface SystemInfo {
  id: string;
  name: string;
  /** The rules editions the system can play, the first being the default. */
  editions: { id: Edition; name: string }[];
}

/** Every system a game can run on. Only D&D 5e for now (see the system seam, a later step). */
export const SYSTEMS: readonly SystemInfo[] = [
  {
    id: 'dnd5e',
    name: 'Dungeons & Dragons 5e',
    editions: [
      { id: '2014', name: '2014 rules (SRD 5.1)' },
      { id: '2024', name: '2024 rules (SRD 5.2)' },
    ],
  },
];

export const DEFAULT_SYSTEM = 'dnd5e';

export function systemOf(id: string): SystemInfo | undefined {
  return SYSTEMS.find((s) => s.id === id);
}

export interface NewGame {
  name: string;
  system: string;
  rules: Edition;
}

/** What is wrong with a new game, if anything. */
export function newGameIssues(game: NewGame): string[] {
  const issues: string[] = [];
  if (!game.name.trim()) issues.push('Give the game a name.');
  const system = systemOf(game.system);
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
  rules: Edition;
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
