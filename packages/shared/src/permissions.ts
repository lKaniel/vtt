import { type Level, levelFor, type Ownership } from '@vtt/core';
import { levelsSeen, onLevel, tokenLevel, wallsOnFloor } from './levels.ts';
import type { PlacedToken, Player, Point, SceneLevel, Wall, World } from './schema.ts';
import { type Eyes, type LightContext, type Perceiver, perceives } from './senses.ts';
import { hasLineOfSight, type LightSource } from './vision.ts';

/** How much of a document a player has; see `Level` in core. */
export type { Level, Ownership } from '@vtt/core';

/** What ownership is decided on: a token, an actor, any document. */
export interface Owned {
  ownership?: Ownership;
}

/** Fields only the GM may change, even on a document a player owns. */
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
  // How big it is and what it sees: a player can't make it huge, see in the dark or light the map.
  // Its picture and look (img, scale, mirroring, ring, name and bars shown) are the owner's.
  'size',
  'filter',
  'model',
  'light',
  'darkvision',
  'blindsight',
  'tremorsense',
  'truesight',
  'devilsSight',
];

/** GM-only fields a trusted player may change on what they own: how their creature is built and sees, and how high it is. */
const TRUSTED_FIELDS = new Set([
  'elevation',
  'size',
  'filter',
  'model',
  'light',
  'darkvision',
  'blindsight',
  'tremorsense',
  'truesight',
  'devilsSight',
]);

const RANK: Record<Level, number> = { none: 0, limited: 1, observer: 2, owner: 3 };
const atLeast = (level: Level, min: Level) => RANK[level] >= RANK[min];

export function isGm(player: Pick<Player, 'role'>): boolean {
  return player.role === 'gm';
}

/** A trusted seat (or the GM): edits all of what it owns, and bends the rules of its turns. */
export function isTrusted(player: Pick<Player, 'role'>): boolean {
  return isGm(player) || player.role === 'trusted';
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

/** Shown on the map, as Foundry does whatever the ownership: not hidden, and for illusions only those they were woven for. */
export function isShownTo(doc: { hidden?: boolean; visibleTo?: string[] }, player: Player): boolean {
  if (isGm(player)) return true;
  return !doc.hidden && (!doc.visibleTo || doc.visibleTo.includes(player.id));
}

/** Know it is there: shown (see isShownTo) and at least limited. */
export function canSee(doc: Owned & { hidden?: boolean; visibleTo?: string[] }, player: Player): boolean {
  return isShownTo(doc, player) && atLeast(levelOf(doc, player), 'limited');
}

/** Read all of it: a creature's sheet, and see through its eyes. */
export function canObserve(doc: Owned, player: Player): boolean {
  return atLeast(levelOf(doc, player), 'observer');
}

/** Act with it: move, attack, cast, arrange its action bar. */
export function canControl(doc: Owned, player: Player): boolean {
  return levelOf(doc, player) === 'owner';
}

/** Change it in edit mode: the GM, or a player who owns it (an observer seat only watches). */
export function canEdit(doc: Owned, player: Player): boolean {
  return isGm(player) || (player.role !== 'observer' && canControl(doc, player));
}

/** Override the rules of its turn (give back an action, a reaction, movement; set its initiative): the GM, or a trusted seat that controls it. */
export function canOverride(doc: Owned, player: Player): boolean {
  return isGm(player) || (isTrusted(player) && canControl(doc, player));
}

/**
 * The keys of an edit that only the GM may make, in the order given; `system` adds its own (SystemDefinition `gmOnlyFields`).
 * A trusted seat may also change how its creature is built and sees (`TRUSTED_FIELDS`).
 */
export function lockedPatchKeys(
  patch: Record<string, unknown>,
  player: Player,
  system: readonly string[] = [],
): string[] {
  if (isGm(player)) return [];
  const gmOnly = (k: string) => GM_ONLY_FIELDS.includes(k) && !(isTrusted(player) && TRUSTED_FIELDS.has(k));
  return Object.keys(patch).filter((k) => gmOnly(k) || system.includes(k));
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
  /** Where it is indoors on a level (see indoors.ts): the sky's light doesn't reach there. */
  indoors?: (level: string | undefined) => (p: Point) => boolean;
}

interface LevelEyes {
  eyes: Eyes;
  level: string | undefined;
  /** The levels these eyes see (their own and those it looks down on); undefined on a scene without levels. */
  seen: readonly string[] | undefined;
  /** The light on `level`, past the walls of the viewer's own level. */
  light: (level: string | undefined) => LightContext;
}

/** A viewer's eyes, with the walls of their own level and the light of whichever level they look at. */
function eyesOf<T extends PlacedToken>(v: T, ctx: SightContext<T>): LevelEyes {
  const p = ctx.perceiver(v);
  const level = tokenLevel(ctx.levels, v);
  const gridSize = ctx.world.gridSize;
  const past = (kind: 'sight' | 'light') => (a: Point, b: Point) =>
    hasLineOfSight(a, b, wallsOnFloor(ctx.wallsBetween(a, b), ctx.levels, v), { kind, gridSize });
  const light = (on: string | undefined): LightContext => ({
    darkness: ctx.world.darkness,
    gridSize,
    lights: ctx.lights.filter((l) => onLevel(l, on)),
    clear: past('sight'),
    lit: past('light'),
    indoors: ctx.indoors?.(on),
  });
  const eyes = { at: [v.x, v.y] as Point, senses: p.senses, blinded: p.blinded };
  return { eyes, level, seen: levelsSeen(ctx.levels, level), light };
}

/** Whether eyes see a target on `level`: on their own floor, or one they look down on. */
function looksAt(e: LevelEyes, level: string | undefined): boolean {
  return e.level === level || !!(level && e.seen?.includes(level));
}

/**
 * Ids of the tokens a player may know about right now. The GM knows all.
 * A token's ownership doesn't hide it (it only keeps its sheet, as in
 * Foundry); hiding does. Players always see the party (tokens any player controls); anything else
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
    return eyes.some((e) => looksAt(e, level) && perceives(e.eyes, target, e.light(level)));
  };
  const ids = tokens
    .filter((t) => isShownTo(t, player))
    .filter((t) => seesAll || isParty(t) || spotted(t))
    .map((t) => t.id);
  return new Set(ids);
}
