import type { Player, Point, Token, Wall, World } from './schema.ts';
import { hasCondition, perceives, sensesOf, type Eyes, type LightContext, type MonsterSenses } from './senses.ts';
import { hasLineOfSight, type LightSource } from './vision.ts';

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
  /** The senses on a monster's stat block, for tokens that use one. */
  monster?: (token: Token) => Partial<MonsterSenses> | undefined;
}

/**
 * Ids of the tokens a player may know about right now. The GM knows all.
 * Players always see the party (tokens any player controls); anything else
 * must be perceived by one of their tokens: seen in light or with darkvision,
 * or felt with blindsight or tremorsense (see senses.ts).
 */
export function tokensVisibleTo(player: Player, tokens: readonly Token[], ctx: SightContext): Set<string> {
  const viewers = tokens.filter((t) => t.controllers.includes(player.id));
  const seesAll = player.role === 'gm' || !ctx.world.vision;
  const light: LightContext = {
    darkness: ctx.world.darkness,
    gridSize: ctx.world.gridSize,
    lights: ctx.lights,
    clear: (a, b) => hasLineOfSight(a, b, ctx.wallsBetween(a, b)),
  };
  const eyes = viewers.map((v) => eyesOf(v, ctx));
  const spotted = (t: Token) => {
    const target = { at: [t.x, t.y] as Point, invisible: hasCondition(t, 'invisible') };
    return eyes.some((e) => perceives(e, target, light));
  };
  const ids = tokens
    .filter((t) => canSeeToken(t, player))
    .filter((t) => seesAll || t.controllers.length > 0 || spotted(t))
    .map((t) => t.id);
  return new Set(ids);
}

function eyesOf(token: Token, ctx: SightContext): Eyes {
  const monster = token.monster ? ctx.monster?.(token) : undefined;
  return { at: [token.x, token.y], senses: sensesOf(token, monster), blinded: hasCondition(token, 'blinded') };
}
