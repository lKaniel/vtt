import type { Point } from './schema.ts';
import { ActorSchema, TokenSchema, type Actor, type Token } from './schema.ts';
import type { Edition, Monster } from './stats-schema.ts';

// Putting new creatures on the map and editing them: the GM's tools. Pure
// functions, so the server applies them and the client can preview them.

/** A lowercase-dash id made from `name` that `taken` doesn't know yet. */
export function uniqueId(name: string, taken: (id: string) => boolean): string {
  const base =
    name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .join('-') || 'token';
  if (!taken(base)) return base;
  let n = 2;
  while (taken(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** `name`, numbered ("Goblin 2") when a creature on the map already has it. */
export function uniqueName(name: string, names: Iterable<string>): string {
  const used = new Set(names);
  if (!used.has(name)) return name;
  let n = 2;
  while (used.has(`${name} ${n}`)) n++;
  return `${name} ${n}`;
}

/** Where a token of `size` squares dropped at `p` stands: odd sizes on a square centre, even ones on a corner. */
export function placeToken(p: Point, size: number, gridSize: number): Point {
  const offset = Math.round(size) % 2 === 1 ? 0.5 : 0;
  const snap = (v: number) => (Math.round(v / gridSize - offset) + offset) * gridSize;
  return [snap(p[0]), snap(p[1])];
}

export interface Placement {
  id: string;
  name: string;
  at: Point;
  hidden?: boolean;
}

/** A fresh token for a monster from the `rules` book, in a world that plays `worldRules`. */
export function tokenFromMonster(
  monster: Monster,
  { rules, ...place }: Placement & { rules: Edition },
  worldRules: Edition,
): Token {
  return TokenSchema.parse({
    id: place.id,
    name: place.name,
    x: place.at[0],
    y: place.at[1],
    size: monster.size,
    speed: monster.speed,
    darkvision: monster.darkvision,
    monster: monster.id,
    hidden: place.hidden ?? false,
    ...(rules === worldRules ? {} : { stats: { rules } }),
  });
}

/** A copy of an actor standing on the map. */
export function tokenFromActor(actor: Actor, place: Placement): Token {
  const { folder: _folder, ...rest } = actor;
  return TokenSchema.parse({
    ...rest,
    id: place.id,
    name: place.name,
    x: place.at[0],
    y: place.at[1],
    hidden: place.hidden ?? rest.hidden,
  });
}

/** A token saved as an actor: the creature as it was made, without where it stands or what happened to it. */
export function actorFromToken(token: Token, id: string, folder?: string): Actor {
  const { x: _x, y: _y, hp: _hp, effects: _e, concentration: _c, spent: _s, summon: _sum, leader: _l, ...rest } = token;
  return ActorSchema.parse({ ...rest, id, ...(folder ? { folder } : {}) });
}

/** A token with `patch` merged in: `null` removes a field, and the id never changes. Validate the result. */
export function applyTokenPatch(token: Token, patch: Record<string, unknown>): unknown {
  let out: Record<string, unknown> = { ...token };
  for (const [key, value] of Object.entries(patch)) out = value === null ? omitKey(out, key) : { ...out, [key]: value };
  return { ...out, id: token.id };
}

/** `obj` without `key`. */
export function omitKey<T extends object>(obj: T, key: string): T {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key)) as T;
}
