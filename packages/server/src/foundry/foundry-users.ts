import { freeId, type Ownership, slugify } from '@vtt/core';
import type { Player, Role } from '@vtt/shared';
import type { FoundryDoc } from './foundry-db.ts';
import type { MediaLookup } from './foundry-scene.ts';

// Foundry's users as the game's players: the same names, roles and colours,
// and the levels Foundry gave each user on actors and journal entries as
// `ownership` for that player. The first gamemaster is the one importing;
// passwords stay behind (Foundry keeps only their hashes), so the GM gives
// players new ones on the game's page.

/** Foundry roles: 1 player, 2 trusted, 3 assistant GM, 4 gamemaster. */
const ROLES: Record<number, Role> = { 1: 'player', 2: 'trusted', 3: 'gm', 4: 'gm' };

/** Foundry permission levels: 0 none, 1 limited, 2 observer, 3 owner. */
const LEVELS = ['none', 'limited', 'observer', 'owner'] as const;
type Level = (typeof LEVELS)[number];

const COLOUR = /^#[0-9a-f]{6}$/i;
const str = (x: unknown) => (typeof x === 'string' && x ? x : undefined);

export type OwnershipOf = (raw: unknown, floor: 'none' | 'limited') => Ownership | undefined;

export interface FoundryPlayers {
  players: Player[];
  /** A Foundry document's levels as ours; undefined when it says no more than `floor` for everyone. */
  ownership: OwnershipOf;
}

function playerOf(u: FoundryDoc, id: string, media: MediaLookup): Player {
  const color = str(u.color);
  const avatar = str(u.avatar) && media(u.avatar as string);
  return {
    id,
    name: str(u.name) ?? id,
    role: ROLES[u.role as number]!,
    color: color && COLOUR.test(color) ? color : '#8a8a8a',
    ...(avatar ? { avatar } : {}),
  };
}

const levelOf = (x: unknown, floor: Level): Level => {
  const level = LEVELS[typeof x === 'number' ? Math.max(0, Math.min(3, Math.round(x))) : 0]!;
  return LEVELS.indexOf(level) < LEVELS.indexOf(floor) ? floor : level;
};

/** Foundry's levels as ours, for the players `byUser` names (none: only the default level). */
export function foundryOwnership(byUser: ReadonlyMap<string, Player> = new Map()): OwnershipOf {
  return (raw, floor) => {
    if (!raw || typeof raw !== 'object') return undefined;
    const levels = raw as Record<string, unknown>;
    const out: Ownership = { default: levelOf(levels.default, floor) };
    for (const [user, level] of Object.entries(levels)) {
      const player = byUser.get(user);
      const ours = levelOf(level, floor);
      if (player && player.role !== 'gm' && ours !== out.default) out[player.id] = ours;
    }
    return Object.keys(out).length > 1 || out.default !== floor ? out : undefined;
  };
}

/** The players for Foundry's `users`, the importing `gm` first. */
export function foundryPlayers(users: readonly FoundryDoc[], gm: Player, media: MediaLookup): FoundryPlayers {
  const players: Player[] = [gm];
  const byUser = new Map<string, Player>();
  const taken = new Set([gm.id]);
  let gmTaken = false;
  for (const u of users.filter((x) => ROLES[x.role as number] && str(x._id))) {
    if (u.role === 4 && !gmTaken) {
      gmTaken = true;
      byUser.set(u._id as string, gm);
      continue;
    }
    const id = freeId(slugify(str(u.name) ?? '') || 'player', (x) => taken.has(x), { bare: true });
    taken.add(id);
    const player = playerOf(u, id, media);
    players.push(player);
    byUser.set(u._id as string, player);
  }
  return { players, ownership: foundryOwnership(byUser) };
}
