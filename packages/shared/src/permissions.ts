import type { Player, Point, Token, Wall, World } from './schema.ts';
import { feetToPx, hasLineOfSight, type LightSource } from './vision.ts';

/** How much of a token a player has, like Foundry's ownership levels. */
export type Ownership = 'none' | 'observer' | 'owner';

/** Fields only the GM may change, even on a token a trusted player owns. */
const GM_ONLY_FIELDS = ['id', 'x', 'y', 'controllers', 'observers', 'hidden', 'visibleTo', 'summon', 'leader'];

export function isGm(player: Pick<Player, 'role'>): boolean {
  return player.role === 'gm';
}

/** A token is in the party when some player owns it. */
export function isPartyToken(token: Pick<Token, 'controllers'>): boolean {
  return token.controllers.length > 0;
}

/**
 * The GM owns everything. Controllers own their tokens and `observers` may
 * look; an observer seat never goes above looking, and looks at the whole party.
 */
export function ownershipOf(token: Token, player: Player): Ownership {
  if (isGm(player)) return 'owner';
  const listed = token.controllers.includes(player.id);
  if (player.role === 'observer') return listed || isPartyToken(token) ? 'observer' : 'none';
  if (listed) return 'owner';
  return token.observers?.includes(player.id) ? 'observer' : 'none';
}

/** Act with it: move, attack, cast, arrange its action bar. */
export function canControlToken(token: Token, player: Player): boolean {
  return ownershipOf(token, player) === 'owner';
}

/** Read its full sheet and see through its eyes. */
export function canObserveToken(token: Token, player: Player): boolean {
  return ownershipOf(token, player) !== 'none';
}

/** Change its sheet in edit mode: the GM, or a trusted player who owns it. */
export function canEditToken(token: Token, player: Player): boolean {
  return isGm(player) || (player.role === 'trusted' && canControlToken(token, player));
}

/** The keys of an edit that only the GM may make, in the order given. */
export function lockedPatchKeys(patch: Record<string, unknown>, player: Player): string[] {
  return isGm(player) ? [] : Object.keys(patch).filter((k) => GM_ONLY_FIELDS.includes(k));
}

export function canSeeToken(token: Token, player: Player): boolean {
  if (isGm(player)) return true;
  if (token.hidden) return false;
  if (token.visibleTo) return token.visibleTo.includes(player.id);
  return true;
}

export interface SightContext {
  world: Pick<World, 'darkness' | 'vision' | 'gridSize'>;
  lights: readonly LightSource[];
  /** Walls that could stand between two points. */
  wallsBetween: (a: Point, b: Point) => readonly Wall[];
}

/**
 * Ids of the tokens a player may know about right now. The GM knows all.
 * Players always see the party (tokens any player controls); anything else
 * must be in line of sight of a token they own or observe and either lit or
 * within that token's darkvision.
 */
export function tokensVisibleTo(player: Player, tokens: readonly Token[], ctx: SightContext): Set<string> {
  const viewers = tokens.filter((t) => canObserveToken(t, player));
  const seesAll = isGm(player) || !ctx.world.vision;
  const ids = tokens
    .filter((t) => canSeeToken(t, player))
    .filter((t) => seesAll || isPartyToken(t) || isSpotted(t, viewers, ctx))
    .map((t) => t.id);
  return new Set(ids);
}

/** Whether any viewer has a clear line to `token` and it's lit or within their darkvision. */
function isSpotted(token: Token, viewers: readonly Token[], ctx: SightContext): boolean {
  const p: Point = [token.x, token.y];
  const clear = (from: Point) => hasLineOfSight(from, p, ctx.wallsBetween(from, p));
  const within = (from: Point, feet: number) =>
    Math.hypot(from[0] - p[0], from[1] - p[1]) <= feetToPx(feet, ctx.world.gridSize);
  let lit: boolean | undefined;
  const isLit = () =>
    (lit ??=
      ctx.world.darkness < 0.5 || ctx.lights.some((l) => within([l.x, l.y], l.bright + l.dim) && clear([l.x, l.y])));
  return viewers.some((v) => (within([v.x, v.y], v.darkvision) || isLit()) && clear([v.x, v.y]));
}
