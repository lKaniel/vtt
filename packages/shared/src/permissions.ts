import { type Level, levelFor, type Ownership } from '@vtt/core';
import { onLevel, tokenLevel } from './levels.ts';
import type { PlacedToken, Player, Point, SceneLevel, Wall, World } from './schema.ts';
import { type Eyes, type LightContext, type Perceiver, perceives } from './senses.ts';
import { hasLineOfSight, type LightSource } from './vision.ts';

/** How much of a document a player has; see `Level` in core. */
export type { Level, Ownership } from '@vtt/core';

/** What ownership is decided on: a token, an actor, any document. */
export interface Owned {
  ownership?: Ownership;
}

/** Fields only the GM may change, even on a document a trusted player owns. */
const GM_ONLY_FIELDS = [
  'id',
  'x',
  'y',
  'elevation',
  'ownership',
  'hidden',
  'visibleTo',
  'summon',
  'leader',
  'actor',
  'linked',
];

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

export interface SightContext<T> {
  world: Pick<World, 'darkness' | 'vision' | 'gridSize'>;
  lights: readonly LightSource[];
  /** Walls that could stand between two points. */
  wallsBetween: (a: Point, b: Point) => readonly Wall[];
  /** A token's senses and conditions, as the game's system works them out. */
  perceiver: (token: T) => Perceiver;
  /** The scene's floors (see levels.ts): a viewer sees, is lit and blocked only on their own. */
  levels?: readonly SceneLevel[];
}

interface LevelEyes {
  eyes: Eyes;
  level: string | undefined;
  light: LightContext;
}

/** A viewer's eyes, with the light and walls of their own level. */
function eyesOf<T extends PlacedToken>(v: T, ctx: SightContext<T>): LevelEyes {
  const p = ctx.perceiver(v);
  const level = tokenLevel(ctx.levels, v);
  const light: LightContext = {
    darkness: ctx.world.darkness,
    gridSize: ctx.world.gridSize,
    lights: ctx.lights.filter((l) => onLevel(l, level)),
    clear: (a, b) =>
      hasLineOfSight(
        a,
        b,
        ctx.wallsBetween(a, b).filter((w) => onLevel(w, level)),
      ),
  };
  return { eyes: { at: [v.x, v.y], senses: p.senses, blinded: p.blinded }, level, light };
}

/**
 * Ids of the tokens a player may know about right now. The GM knows all.
 * Players always see the party (tokens any player controls); anything else
 * must be perceived by a token they own or observe on its own level: seen in
 * light or with darkvision, or felt with blindsight or tremorsense (see senses.ts).
 */
export function tokensVisibleTo<T extends PlacedToken>(
  player: Player,
  tokens: readonly T[],
  ctx: SightContext<T>,
): Set<string> {
  const seesAll = isGm(player) || !ctx.world.vision;
  const eyes = seesAll ? [] : tokens.filter((t) => canObserve(t, player)).map((v) => eyesOf(v, ctx));
  const spotted = (t: T) => {
    const target = { at: [t.x, t.y] as Point, invisible: ctx.perceiver(t).invisible };
    const level = tokenLevel(ctx.levels, t);
    return eyes.some((e) => e.level === level && perceives(e.eyes, target, e.light));
  };
  const ids = tokens
    .filter((t) => canSee(t, player))
    .filter((t) => seesAll || isParty(t) || spotted(t))
    .map((t) => t.id);
  return new Set(ids);
}
