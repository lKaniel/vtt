import { freeId, type FoundrySheets, slugify, type SystemDefinition } from '@vtt/core';
import type { FoundryDoc } from './foundry-db.ts';
import type { FolderLookup } from './foundry-entries.ts';
import type { MediaLookup } from './foundry-scene.ts';

// A Foundry world's actors and the tokens on its scenes, as our actors and
// tokens.json entries. What a creature *is* (its stats, gear, spells) is the
// game system's to read (SystemDefinition.foundry); here are the parts
// every system shares: name, picture, size, ownership, folder, and where a
// token stands, whether it shares its actor's sheet, and what it changes.

const obj = (x: unknown): FoundryDoc => (x && typeof x === 'object' && !Array.isArray(x) ? (x as FoundryDoc) : {});
const str = (x: unknown) => (typeof x === 'string' && x ? x : undefined);
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
const plural = (n: number, what: string) => `${n} ${what}${n === 1 ? '' : 's'}`;

/** Ids from names, each free in its list. */
export function idMaker(fallback: string) {
  const taken = new Set<string>();
  return (name: string) => {
    const id = freeId(slugify(name) || fallback, (x) => taken.has(x), { bare: true });
    taken.add(id);
    return id;
  };
}

/** Foundry folders by id, named by their path: "Monsters / Goblins". */
export function folderNames(folders: FoundryDoc[]): FolderLookup {
  const byId = new Map(folders.flatMap((f) => (str(f._id) ? [[f._id as string, f] as const] : [])));
  const nameOf = (id: string | null | undefined, depth = 0): string | undefined => {
    const folder = id ? byId.get(id) : undefined;
    if (!folder || depth > 20) return undefined;
    const parent = nameOf(str(folder.folder), depth + 1);
    const name = str(folder.name) ?? 'Folder';
    return parent ? `${parent} / ${name}` : name;
  };
  return nameOf;
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
  skipped: string[];
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
}

/** Foundry permission levels: 0 none, 1 limited, 2 observer, 3 owner. Players never lose sight of a token here. */
const LEVELS = [undefined, undefined, 'observer', 'owner'] as const;

function ownershipOf(a: FoundryDoc): { ownership?: { default: string } } {
  const level = LEVELS[num(obj(a.ownership ?? a.permission).default) ?? 0];
  return level ? { ownership: { default: level } } : {};
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
    ...ownershipOf(a),
  };
}

interface OneActor {
  file: Record<string, unknown>;
  placed: PlacedActor;
  skipped: string[];
}

/** One actor file: the shared fields and its system's sheet (left out if the system can't read it). */
function actorOf(a: FoundryDoc, id: string, ctx: ActorContext): OneActor {
  const base = actorBase(a, id, ctx);
  const name = base.name as string;
  const fromSystem = ctx.sheets?.sheet(a, ctx.rules) ?? { sheet: {}, skipped: [] };
  const full = { ...base, ...fromSystem.sheet };
  const ok = ctx.system.actorSchema.safeParse(full).success;
  const file = ok ? full : base;
  const skipped = fromSystem.skipped.map((s) => `actor "${name}": ${s}`);
  if (!ok) skipped.push(`actor "${name}": its sheet, which could not be read (only its name and picture came along)`);
  const placed = { id, name, img: str(file.img), size: num(file.size) ?? 1, linked: file.linked === true };
  return { file, placed, skipped };
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
    ...(at.size !== 1 ? { size: at.size } : {}),
    ...(img ? { img } : {}),
    ...(t.hidden === true ? { hidden: true } : {}),
  };
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
): { tokens: Record<string, unknown>[]; skipped: string[] } {
  const nextId = idMaker('token');
  const skipped: string[] = [];
  const tokens = (Array.isArray(raw) ? raw : []).map((x) => {
    const t = obj(x);
    const token = tokenOf(t, nextId(str(t.name) ?? 'token'), ctx);
    if (!token.actor)
      skipped.push(
        `token "${String(token.name)}" stands for an actor that is not in the world, so it carries only its name and picture`,
      );
    return token;
  });
  return { tokens, skipped };
}

export { plural };
