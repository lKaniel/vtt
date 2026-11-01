import type { Player, Point, Token, Wall, World } from './schema.ts';
import { hasCondition, perceives, sensesOf, type Eyes, type LightContext, type MonsterSenses } from './senses.ts';
import { hasLineOfSight, type LightSource } from './vision.ts';

/** How much of a token a player has, like Foundry's ownership levels. */
export type Ownership = 'none' | 'observer' | 'owner';

/** Fields only the GM may change, even on a token a trusted player owns. */
const GM_ONLY_FIELDS = [
  'id',
  'x',
  'y',
  'controllers',
  'observers',
  'hidden',
  'visibleTo',
  'summon',
  'leader',
  'actor',
  'linked',
];

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
  /** The senses on a monster's stat block, for tokens that use one. */
  monster?: (token: Token) => Partial<MonsterSenses> | undefined;
}

/**
 * Ids of the tokens a player may know about right now. The GM knows all.
 * Players always see the party (tokens any player controls); anything else
 * must be perceived by a token they own or observe: seen in light or with darkvision,
 * or felt with blindsight or tremorsense (see senses.ts).
 */
export function tokensVisibleTo(player: Player, tokens: readonly Token[], ctx: SightContext): Set<string> {
  const viewers = tokens.filter((t) => canObserveToken(t, player));
  const seesAll = isGm(player) || !ctx.world.vision;
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
    .filter((t) => seesAll || isPartyToken(t) || spotted(t))
    .map((t) => t.id);
  return new Set(ids);
}

function eyesOf(token: Token, ctx: SightContext): Eyes {
  const monster = token.monster ? ctx.monster?.(token) : undefined;
  return { at: [token.x, token.y], senses: sensesOf(token, monster), blinded: hasCondition(token, 'blinded') };
}
