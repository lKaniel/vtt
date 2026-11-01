import type { Point } from '@vtt/shared';
import { type Actor, ActorSchema, type Token, TokenSchema } from './token-schema.ts';
import { toEdition } from './content.ts';
import type { Edition, Monster } from './stats-schema.ts';

// Putting new creatures on the map and editing them: the GM's tools. Pure
// functions, so the server applies them and the client can preview them.

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
  worldRules: string | undefined,
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
    ...(rules === toEdition(worldRules) ? {} : { stats: { rules } }),
  });
}

/** The stock actor of a monster from the `rules` book, kept in the GM's Monsters folder. */
export function actorFromMonster(monster: Monster, rules: Edition, worldRules: string | undefined): Actor {
  return ActorSchema.parse({
    id: monster.id,
    name: monster.name,
    folder: 'Monsters',
    size: monster.size,
    speed: monster.speed,
    darkvision: monster.darkvision,
    monster: monster.id,
    ...(rules === toEdition(worldRules) ? {} : { stats: { rules } }),
  });
}

/** Whether new tokens of an actor share its state: as it says, else unless it's a monster. */
export function linksByDefault(actor: Pick<Actor, 'linked' | 'monster'>): boolean {
  return actor.linked ?? !actor.monster;
}

/** A token of an actor standing on the map: linked to it, or an unlinked copy (see token-link.ts). */
export function tokenFromActor(actor: Actor, place: Placement): Token {
  const { folder: _folder, linked: _linked, ...rest } = actor;
  return TokenSchema.parse({
    ...rest,
    id: place.id,
    name: place.name,
    x: place.at[0],
    y: place.at[1],
    hidden: place.hidden ?? rest.hidden,
    actor: actor.id,
    linked: linksByDefault(actor),
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
