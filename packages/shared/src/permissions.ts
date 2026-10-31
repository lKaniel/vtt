import type { Player, Point, Token, Wall, World } from './schema.ts';
import { feetToPx, hasLineOfSight, type LightSource } from './vision.ts';

export function canSeeToken(token: Token, player: Player): boolean {
  if (player.role === 'gm') return true;
  if (token.hidden) return false;
  if (token.visibleTo) return token.visibleTo.includes(player.id);
  return true;
}

export function canControlToken(token: Token, player: Player): boolean {
  return player.role === 'gm' || token.controllers.includes(player.id);
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
 * must be in line of sight of one of their tokens and either lit or within
 * that token's darkvision.
 */
export function tokensVisibleTo(player: Player, tokens: readonly Token[], ctx: SightContext): Set<string> {
  const viewers = tokens.filter((t) => t.controllers.includes(player.id));
  const seesAll = player.role === 'gm' || !ctx.world.vision;
  const ids = tokens
    .filter((t) => canSeeToken(t, player))
    .filter((t) => seesAll || t.controllers.length > 0 || isSpotted(t, viewers, ctx))
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
