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
  const out = new Set<string>();
  const viewers = tokens.filter((t) => t.controllers.includes(player.id));
  const g = ctx.world.gridSize;
  const clear = (a: Point, b: Point) => hasLineOfSight(a, b, ctx.wallsBetween(a, b));
  for (const t of tokens) {
    if (!canSeeToken(t, player)) continue;
    if (player.role === 'gm' || !ctx.world.vision || t.controllers.length > 0) {
      out.add(t.id);
      continue;
    }
    const p: Point = [t.x, t.y];
    let lit: boolean | undefined;
    const isLit = () =>
      (lit ??=
        ctx.world.darkness < 0.5 ||
        ctx.lights.some(
          (l) => Math.hypot(l.x - p[0], l.y - p[1]) <= feetToPx(l.bright + l.dim, g) && clear([l.x, l.y], p),
        ));
    for (const v of viewers) {
      const inDarkvision = Math.hypot(v.x - p[0], v.y - p[1]) <= feetToPx(v.darkvision, g);
      if ((inDarkvision || isLit()) && clear([v.x, v.y], p)) {
        out.add(t.id);
        break;
      }
    }
  }
  return out;
}
