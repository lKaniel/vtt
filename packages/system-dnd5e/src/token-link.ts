import { z } from 'zod';
import { type Actor, ActorSchema, type Token, TokenSchema } from './token-schema.ts';
import { linksByDefault } from './spawn.ts';

// Actors and tokens. An actor is a creature's sheet (actors/<id>.json); a
// token is that actor standing on a scene (an entry in tokens.json). A
// linked token reads and writes its actor, so every copy shares hit points
// and effects; an unlinked token keeps a `delta`, only what differs from
// its actor, so three goblins from one actor each have their own wounds.
// A token without an actor carries its whole sheet itself.
//
// The rules never see entries: resolveToken() merges actor and delta into
// the one Token shape they work on, and splitToken() puts a changed Token
// back where its parts are stored.

/** Where a token is and who sees it: always the token's own, never the actor's. */
const PLACEMENT = ['id', 'x', 'y', 'elevation', 'hidden', 'visibleTo', 'summon', 'leader', 'actor', 'linked'] as const;
/** What a copy keeps as its own when its changes are saved to the actor or reset. */
const INSTANCE = ['name', 'hp', 'tempHp', 'deathSaves', 'effects', 'concentration', 'spent'];
const isPlacement = (key: string) => (PLACEMENT as readonly string[]).includes(key);

type Fields = Record<string, unknown>;
type Shape = typeof TokenSchema.shape;
type Sheet = Omit<Shape, (typeof PLACEMENT)[number]>;

/** A field schema without its default, so nothing is filled in that the file didn't say. */
function bare(schema: z.ZodType): z.ZodType {
  return schema instanceof z.ZodDefault ? (schema.unwrap() as z.ZodType) : schema;
}

const shapeEntries = Object.entries(TokenSchema.shape) as [keyof Shape, z.ZodType][];
const sheetShape = Object.fromEntries(
  shapeEntries.filter(([k]) => !isPlacement(k)).map(([k, v]) => [k, bare(v).optional()]),
) as { [K in keyof Sheet]: z.ZodOptional<z.ZodType<z.infer<Sheet[K]>>> };
const deltaShape = Object.fromEntries(
  shapeEntries.filter(([k]) => !isPlacement(k)).map(([k, v]) => [k, bare(v).nullable().optional()]),
) as { [K in keyof Sheet]: z.ZodOptional<z.ZodNullable<z.ZodType<z.infer<Sheet[K]>>>> };
const placementShape = {
  id: TokenSchema.shape.id,
  x: TokenSchema.shape.x,
  y: TokenSchema.shape.y,
  elevation: TokenSchema.shape.elevation,
  hidden: z.boolean().optional(),
  visibleTo: TokenSchema.shape.visibleTo,
  summon: TokenSchema.shape.summon,
  leader: TokenSchema.shape.leader,
  actor: TokenSchema.shape.actor,
  linked: TokenSchema.shape.linked,
};

/** A token as stored in a scene's tokens.json. */
export const TokenEntrySchema = z
  .object({
    ...placementShape,
    ...sheetShape,
    /** What this token has that its actor doesn't: a field to override, or null to remove it. */
    delta: z.object(deltaShape).optional(),
  })
  .superRefine((entry, ctx) => {
    if (!entry.actor) return;
    const sheet = Object.keys(entry).filter((k) => !isPlacement(k) && k !== 'delta');
    for (const key of sheet) {
      ctx.addIssue({ code: 'custom', path: [key], message: `a token with an actor keeps its own ${key} in delta` });
    }
  });
export type TokenEntry = z.infer<typeof TokenEntrySchema>;

/** JSON with object keys sorted, so field order doesn't count as a difference. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/** True when two values hold the same JSON. */
export function sameJson(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

/** The fields of `obj` whose keys pass `keep`. */
function only(obj: object, keep: (key: string) => boolean): Fields {
  return Object.fromEntries(Object.entries(obj).filter(([k, v]) => keep(k) && v !== undefined));
}

/** The placement fields of raw token JSON: where it is, who sees it, its actor. */
export function placementFields(raw: object): Fields {
  return only(raw, isPlacement);
}

/** The sheet fields of raw token or actor JSON, without placement, `folder` and `delta`. */
export function sheetFields(raw: object): Fields {
  return only(raw, (k) => !isPlacement(k) && k !== 'folder' && k !== 'delta');
}

/** Raw sheet JSON without what belongs to one copy: wounds, effects, spent uses. */
export function templateFields(sheet: object): Fields {
  return only(sheet, (k) => k === 'name' || !INSTANCE.includes(k));
}

/** The sheet of an actor: what its tokens take from it. */
function sheetOf(actor: Actor | undefined): Fields {
  return actor ? only(actor, (k) => !isPlacement(k) && k !== 'folder') : {};
}

/** `base` with `delta` laid over it: null removes a field. */
function applyDelta(base: Fields, delta: Fields): Fields {
  const merged = { ...base, ...only(delta, () => true) };
  return only(merged, (k) => delta[k] !== null);
}

/** What `sheet` changes in `base`: fields that differ, and null for fields it lacks. */
export function deltaOf(sheet: Fields, base: Fields): Fields {
  const out: Fields = {};
  for (const [key, value] of Object.entries(sheet)) if (!sameJson(value, base[key])) out[key] = value;
  for (const key of Object.keys(base)) if (!(key in sheet)) out[key] = null;
  return out;
}

/** Whether a token shares its actor's state: as the token says, else as the actor says, else unless it's a monster. */
function linkedOf(entry: Pick<TokenEntry, 'actor' | 'linked'>, actor: Actor | undefined): boolean {
  if (!entry.actor) return false;
  return entry.linked ?? (actor ? linksByDefault(actor) : true);
}

export interface Resolved {
  token?: Token;
  errors: string[];
}

/** The creature a token is: its actor's sheet, its delta laid over, where it stands. */
export function resolveToken(entry: TokenEntry, actor: Actor | undefined): Resolved {
  if (entry.actor && !actor) return { errors: [`unknown actor "${entry.actor}"`] };
  const { delta = {}, ...own } = entry;
  const merged = { ...applyDelta(sheetOf(actor), delta), ...only(own, () => true), linked: linkedOf(entry, actor) };
  const r = TokenSchema.safeParse(merged);
  if (r.success) return { token: r.data, errors: [] };
  return { errors: r.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)) };
}

/** The placement fields of a token, without the default `hidden: false`. */
function placementOf(token: Token): Fields {
  const out = only(token, isPlacement);
  if (out.hidden === false) delete out.hidden;
  return out;
}

function entryOf(placement: Fields, delta: Fields): TokenEntry {
  return (Object.keys(delta).length ? { ...placement, delta } : placement) as TokenEntry;
}

export interface Split {
  entry: TokenEntry;
  /** The actor to save, when it changed or is new. */
  actor?: Actor;
}

/**
 * Puts a changed token back where its parts live. A linked token's sheet
 * goes to its actor (fields the token already overrides stay in its delta);
 * an unlinked token keeps what differs from its actor as its delta. An
 * actor the token names that doesn't exist yet is made from the token.
 */
export function splitToken(token: Token, entry: TokenEntry | undefined, actor: Actor | undefined): Split {
  const placement = placementOf(token);
  const sheet = only(token, (k) => !isPlacement(k));
  if (!token.actor) return { entry: { ...placement, ...sheet } as TokenEntry };
  if (!actor) {
    const created = ActorSchema.parse({ ...sheet, id: token.actor, linked: token.linked });
    return { entry: placementOf({ ...token, linked: linkedOf(token, created) }) as TokenEntry, actor: created };
  }
  const base = sheetOf(actor);
  if (!linkedOf(token, actor)) return { entry: entryOf(placement, deltaOf(sheet, base)) };
  const own = Object.keys(entry?.delta ?? {});
  const delta = deltaOf(
    only(sheet, (k) => own.includes(k)),
    only(base, (k) => own.includes(k)),
  );
  const kept = only(actor, (k) => isPlacement(k) || k === 'folder' || own.includes(k));
  const next = ActorSchema.parse({ ...kept, ...only(sheet, (k) => !own.includes(k)), id: actor.id });
  return { entry: entryOf(placement, delta), ...(sameJson(next, actor) ? {} : { actor: next }) };
}

/** The token as a copy of its actor: the same, but its own from now on. */
export function unlinkToken(entry: TokenEntry): TokenEntry {
  return { ...entry, linked: false };
}

/** The token linked to its actor again: it takes the actor's state, dropping its own. */
export function linkToken(entry: TokenEntry): TokenEntry {
  const { delta: _delta, ...rest } = entry;
  return { ...rest, linked: true };
}

/** Saves a copy's changes (stats, gear, looks) to its actor; its wounds, effects and name stay its own. */
export function saveTokenToActor(entry: TokenEntry, actor: Actor): { entry: TokenEntry; actor: Actor } {
  const delta = entry.delta ?? {};
  const shared = only(delta, (k) => !INSTANCE.includes(k));
  const next = ActorSchema.parse({ ...applyDelta(actor, shared), id: actor.id });
  const { delta: _delta, ...rest } = entry;
  return {
    entry: entryOf(
      rest,
      only(delta, (k) => INSTANCE.includes(k)),
    ),
    actor: next,
  };
}

/** A copy made fresh from its actor again, keeping only its own name. */
export function resetToken(entry: TokenEntry): TokenEntry {
  const { delta, ...rest } = entry;
  return entryOf(
    rest,
    only(delta ?? {}, (k) => k === 'name'),
  );
}

/** The token carrying its whole sheet, with no actor (its actor is being deleted). */
export function standaloneEntry(token: Token): TokenEntry {
  const { actor: _actor, linked: _linked, ...rest } = token;
  return splitToken(rest, undefined, undefined).entry;
}
