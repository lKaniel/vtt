import { levelFor, type Level, type Ownership } from '@vtt/core';
import type { Player, Point, Token, Wall, World } from './schema.ts';
import { hasCondition, perceives, sensesOf, type Eyes, type LightContext, type MonsterSenses } from './senses.ts';
import { hasLineOfSight, type LightSource } from './vision.ts';

/** How much of a document a player has; see `Level` in core. */
export type { Level, Ownership } from '@vtt/core';

/** What ownership is decided on: a token, an actor, any document. */
export interface Owned {
  ownership?: Ownership;
}

/** Fields only the GM may change, even on a document a trusted player owns. */
const GM_ONLY_FIELDS = ['id', 'x', 'y', 'ownership', 'hidden', 'visibleTo', 'summon', 'leader', 'actor', 'linked'];

const RANK: Record<Level, number> = { none: 0, limited: 1, observer: 2, owner: 3 };
const atLeast = (level: Level, min: Level) => RANK[level] >= RANK[min];

export function isGm(player: Pick<Player, 'role'>): boolean {
  return player.role === 'gm';
}

/** Ids of the players who own it. */
export function ownersOf(doc: Owned): string[] {
  const players = Object.entries(doc.ownership ?? {}).filter(([id]) => id !== 'default');
  return players.filter(([, level]) => level === 'owner').map(([id]) => id);
}

/** A document is the party's when some player owns it. */
export function isParty(doc: Owned): boolean {
  return doc.ownership?.default === 'owner' || ownersOf(doc).length > 0;
}

/**
 * The GM owns everything; anyone else has the level the document gives
 * them, or its default. An observer seat never goes above observing, and
 * observes the whole party.
 */
export function levelOf(doc: Owned, player: Player): Level {
  if (isGm(player)) return 'owner';
  const level = levelFor(doc.ownership, player.id);
  if (player.role !== 'observer') return level;
  return atLeast(level, 'observer') || isParty(doc) ? 'observer' : level;
}

/** Know it is there: at least limited, not hidden, and for illusions only those they were woven for. */
export function canSee(doc: Owned & { hidden?: boolean; visibleTo?: string[] }, player: Player): boolean {
  if (isGm(player)) return true;
  if (doc.hidden) return false;
  if (doc.visibleTo && !doc.visibleTo.includes(player.id)) return false;
  return atLeast(levelOf(doc, player), 'limited');
}

/** Read all of it: a creature's sheet, and see through its eyes. */
export function canObserve(doc: Owned, player: Player): boolean {
  return atLeast(levelOf(doc, player), 'observer');
}

/** Act with it: move, attack, cast, arrange its action bar. */
export function canControl(doc: Owned, player: Player): boolean {
  return levelOf(doc, player) === 'owner';
}

/** Change it in edit mode: the GM, or a trusted player who owns it. */
export function canEdit(doc: Owned, player: Player): boolean {
  return isGm(player) || (player.role === 'trusted' && canControl(doc, player));
}

/** The keys of an edit that only the GM may make, in the order given. */
export function lockedPatchKeys(patch: Record<string, unknown>, player: Player): string[] {
  return isGm(player) ? [] : Object.keys(patch).filter((k) => GM_ONLY_FIELDS.includes(k));
}

/** `ownership` with `player` set to `level`; a level equal to the default is left out. */
export function withLevel(ownership: Ownership | undefined, player: string, level: Level): Ownership {
  const { [player]: _old, ...base }: Ownership = ownership ?? { default: 'limited' };
  return level === base.default ? (base as Ownership) : ({ ...base, [player]: level } as Ownership);
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
  const viewers = tokens.filter((t) => canObserve(t, player));
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
    .filter((t) => canSee(t, player))
    .filter((t) => seesAll || isParty(t) || spotted(t))
    .map((t) => t.id);
  return new Set(ids);
}

function eyesOf(token: Token, ctx: SightContext): Eyes {
  const monster = token.monster ? ctx.monster?.(token) : undefined;
  return { at: [token.x, token.y], senses: sensesOf(token, monster), blinded: hasCondition(token, 'blinded') };
}
