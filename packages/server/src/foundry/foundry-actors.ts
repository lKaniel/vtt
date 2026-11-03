import { madeFrom } from './foundry-origin.ts';
import type { ImportLoss } from '@vtt/core';
import { lost, placed, type PlacedLoss } from './import-losses.ts';
import { foundryOwnership, type OwnershipOf } from './foundry-users.ts';
import { freeId, type FoundrySheets, slugify, type SystemDefinition } from '@vtt/core';
import type { Model3D } from '@vtt/shared';
import type { FoundryDoc } from './foundry-db.ts';
import type { FolderLookup } from './foundry-entries.ts';
import type { MediaLookup } from './foundry-scene.ts';

// A Foundry world's actors and the tokens on its scenes, as our actors and
// tokens.json entries. What a creature *is* (its stats, gear, spells) is the
// game system's to read (SystemDefinition.foundry); here are the parts
// every system shares: name, picture, size, ownership, folder, and where a
// token stands, whether it shares its actor's sheet, and what it changes.

const obj = (x: unknown): FoundryDoc => (x && typeof x === 'object' && !Array.isArray(x) ? (x as FoundryDoc) : {});
export const str = (x: unknown) => (typeof x === 'string' && x ? x : undefined);
export const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);

/** Ids from names, each free in its list. */
export function idMaker(fallback: string) {
  const taken = new Set<string>();
  return (name: string) => {
    const id = freeId(slugify(name) || fallback, (x) => taken.has(x), { bare: true });
    taken.add(id);
    return id;
  };
}

/** What tokens need to know of the actor they stand for. */
export interface PlacedActor {
  id: string;
  name: string;
  img?: string;
  size: number;
  linked: boolean;
}

export interface ConvertedActors {
  /** actors/<id>.json files. */
  actors: Record<string, unknown>[];
  /** By Foundry actor id. */
  byFoundryId: Map<string, PlacedActor>;
  skipped: PlacedLoss[];
}

/** What the import needs of a game system. */
export type ActorSystem = Pick<SystemDefinition, 'id' | 'name' | 'editions' | 'actorSchema' | 'foundry'>;

export interface ActorContext {
  system: ActorSystem;
  /** The system's reading of this world's actors; none when the world is for another Foundry system. */
  sheets?: FoundrySheets;
  rules: string;
  media: MediaLookup;
  folderOf: FolderLookup;
  /** Foundry's levels as ours, with the game's players; default: only the default level. */
  ownership?: OwnershipOf;
}

/** Foundry's levels on an actor as ours; players never lose sight of a token here (at least limited). */
function ownershipOf(a: FoundryDoc, ctx: ActorContext): { ownership?: Record<string, string> } {
  const ownership = (ctx.ownership ?? foundryOwnership())(a.ownership ?? a.permission, 'limited');
  return ownership ? { ownership } : {};
}

/** The picture tokens of it show: the prototype token's, else the portrait. */
function pictureOf(a: FoundryDoc, media: MediaLookup): string | undefined {
  const proto = obj(a.prototypeToken ?? a.token);
  const paths = [str(obj(proto.texture).src), str(proto.img), str(a.img)];
  return paths.reduce<string | undefined>((found, p) => found ?? (p ? media(p) : undefined), undefined);
}

/** The fields every actor has, whatever its system. */
function actorBase(a: FoundryDoc, id: string, ctx: ActorContext): Record<string, unknown> {
  const proto = obj(a.prototypeToken ?? a.token);
  const img = pictureOf(a, ctx.media);
  const width = num(proto.width) ?? 1;
  const folder = ctx.folderOf(str(a.folder));
  return {
    id,
    name: str(a.name) ?? 'Actor',
    ...(img ? { img } : {}),
    ...(folder ? { folder } : {}),
    ...(width !== 1 ? { size: width } : {}),
    linked: typeof proto.actorLink === 'boolean' ? proto.actorLink : a.type === 'character',
    ...ownershipOf(a, ctx),
  };
}

interface OneActor {
  file: Record<string, unknown>;
  placed: PlacedActor;
  skipped: PlacedLoss[];
}

/** One actor file: the shared fields and its system's sheet (left out if the system can't read it). */
function actorOf(a: FoundryDoc, id: string, ctx: ActorContext): OneActor {
  const base = actorBase(a, id, ctx);
  const name = base.name as string;
  const fromSystem = ctx.sheets?.sheet(a, ctx.rules) ?? { sheet: {}, skipped: [] };
  const full = { ...base, ...fromSystem.sheet };
  const ok = ctx.system.actorSchema.safeParse(full).success;
  const file = ok ? full : base;
  const skipped = placed(name, fromSystem.skipped);
  if (!ok) skipped.push({ ...lost('Actor sheets we could not read (only the name and picture came)', 1, [name]) });
  const where = { id, name, img: str(file.img), size: num(file.size) ?? 1, linked: file.linked === true };
  return { file, placed: where, skipped };
}

/** Converts a world's actors. */
export function foundryActors(raw: FoundryDoc[], ctx: ActorContext): ConvertedActors {
  const nextId = idMaker('actor');
  const out: ConvertedActors = { actors: [], byFoundryId: new Map(), skipped: [] };
  for (const a of raw) {
    const { file, placed, skipped } = actorOf(a, nextId(str(a.name) ?? 'actor'), ctx);
    out.actors.push(file);
    out.skipped.push(...skipped);
    if (str(a._id)) out.byFoundryId.set(a._id as string, placed);
  }
  return out;
}

export interface TokenContext {
  /** Pixels per square. */
  grid: number;
  actors: Map<string, PlacedActor>;
  sheets?: FoundrySheets;
  media: MediaLookup;
  /** A token's elevation in feet (on the floor it is on). */
  elevation?: (t: FoundryDoc) => number;
  /** The 3D figure a token stands as (3D Canvas), if any. */
  model?: (t: FoundryDoc) => Model3D | undefined;
}

/** A Foundry token's centre: Foundry keeps the top-left corner, sizes in squares. */
function centreOf(t: FoundryDoc, grid: number): { x: number; y: number; size: number } {
  const size = num(t.width) ?? 1;
  const height = num(t.height) ?? size;
  return { x: (num(t.x) ?? 0) + (size * grid) / 2, y: (num(t.y) ?? 0) + (height * grid) / 2, size };
}

/** What an unlinked token of `actor` has of its own: its name, picture, size and the system's changes. */
function deltaOf(t: FoundryDoc, actor: PlacedActor, ctx: TokenContext, size: number): Record<string, unknown> {
  const name = str(t.name);
  const path = str(obj(t.texture).src) ?? str(t.img);
  const img = path ? ctx.media(path) : undefined;
  return {
    ...(name && name !== actor.name ? { name } : {}),
    ...(img && img !== actor.img ? { img } : {}),
    ...(size !== actor.size ? { size } : {}),
    ...modelOf(t, ctx),
    ...(ctx.sheets?.delta(t.delta ?? t.actorData) ?? {}),
  };
}

/** A token whose actor didn't come along: it carries its name and picture itself. */
function looseToken(t: FoundryDoc, id: string, at: ReturnType<typeof centreOf>, ctx: TokenContext) {
  const path = str(obj(t.texture).src) ?? str(t.img);
  const img = path ? ctx.media(path) : undefined;
  return {
    id,
    name: str(t.name) ?? 'Token',
    x: at.x,
    y: at.y,
    ...elevationOf(t, ctx),
    ...(at.size !== 1 ? { size: at.size } : {}),
    ...(img ? { img } : {}),
    ...modelOf(t, ctx),
    ...(t.hidden === true ? { hidden: true } : {}),
  };
}

/** A token's 3D figure, if it has one. */
function modelOf(t: FoundryDoc, ctx: TokenContext): { model?: Model3D } {
  const model = ctx.model?.(t);
  return model ? { model } : {};
}

/** A token's elevation in feet, left out on the ground. */
function elevationOf(t: FoundryDoc, ctx: TokenContext): { elevation?: number } {
  const feet = ctx.elevation?.(t) ?? 0;
  return feet ? { elevation: feet } : {};
}

/** One tokens.json entry. */
function tokenOf(t: FoundryDoc, id: string, ctx: TokenContext): Record<string, unknown> {
  const at = centreOf(t, ctx.grid);
  const actor = ctx.actors.get(str(t.actorId) ?? '');
  if (!actor) return looseToken(t, id, at, ctx);
  const linked = t.actorLink === true;
  const delta = linked ? {} : deltaOf(t, actor, ctx, at.size);
  return {
    id,
    x: at.x,
    y: at.y,
    ...elevationOf(t, ctx),
    actor: actor.id,
    linked,
    ...(t.hidden === true ? { hidden: true } : {}),
    ...(Object.keys(delta).length ? { delta } : {}),
  };
}

/** A scene's tokens; and the ones that lost their actor. */
export function foundryTokens(
  raw: unknown,
  ctx: TokenContext,
): { tokens: Record<string, unknown>[]; skipped: ImportLoss[] } {
  const nextId = idMaker('token');
  const orphans: string[] = [];
  const tokens = (Array.isArray(raw) ? raw : []).map((x) => {
    const t = obj(x);
    const token = madeFrom(tokenOf(t, nextId(str(t.name) ?? 'token'), ctx), t);
    if (!token.actor) orphans.push(String(token.name));
    return token;
  });
  const what = 'Tokens whose actor is not in the world (they keep only their name and picture)';
  return { tokens, skipped: orphans.length ? [lost(what, orphans.length, orphans)] : [] };
}
