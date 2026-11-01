import {
  actorFromMonster,
  ActorSchema,
  applyTokenPatch,
  canEditToken,
  isGm,
  lockedPatchKeys,
  placeToken,
  sameJson,
  sheetFields,
  srdFor,
  tokenFromActor,
  TokenSchema,
  uniqueId,
  uniqueName,
  type Actor,
  type Edition,
  type Monster,
  type Placement,
  type Player,
  type Point,
  type Role,
  type SpawnSource,
  type Token,
} from '@vtt/shared';
import type { z } from 'zod';
import type { Relink } from './token-ops.ts';
import { Refusal, requireGm, type Table } from './table.ts';

/**
 * The GM's tools: editing any token, placing new ones, keeping the Actors
 * list and deciding who may do what. Trusted players share the editor for
 * the tokens they own.
 */
export class GmActions {
  constructor(private table: Table) {}

  private get store() {
    return this.table.store;
  }

  edit(player: Player, id: string, patch: Record<string, unknown>): void {
    const token = this.store.tokens.get(id);
    if (!token) throw new Refusal('No such token');
    if (!canEditToken(token, player)) throw new Refusal(`You can't edit ${token.name}`);
    const locked = lockedPatchKeys(patch, player);
    if (locked.length) throw new Refusal(`Only the GM can change ${locked.join(', ')}`);
    this.store.setToken(valid(TokenSchema, applyTokenPatch(token, patch)));
  }

  delete(player: Player, id: string): void {
    requireGm(player);
    if (!this.store.tokens.has(id)) throw new Refusal('No such token');
    this.table.removeToken(id);
  }

  spawn(player: Player, from: SpawnSource, at: Point, hidden?: boolean): void {
    requireGm(player);
    this.store.setToken(from.kind === 'monster' ? this.monster(from, at, hidden) : this.copy(from.id, at, hidden));
  }

  /** Links a token to its actor, unlinks it, or saves or resets an unlinked copy's changes. */
  relink(player: Player, id: string, how: Relink): void {
    requireGm(player);
    const token = this.store.tokens.get(id);
    if (!token) throw new Refusal('No such token');
    if (!token.actor || !this.store.actors.has(token.actor)) throw new Refusal(`${token.name} has no actor`);
    if (token.linked && (how === 'save' || how === 'reset')) {
      throw new Refusal(`${token.name} is linked: its changes are already its actor’s`);
    }
    this.store.relinkToken(id, how);
  }

  saveActor(player: Player, actor: unknown): void {
    requireGm(player);
    this.store.setActor(valid(ActorSchema, actor));
  }

  deleteActor(player: Player, id: string): void {
    requireGm(player);
    this.store.removeActor(id);
  }

  /** Changes a seat's role; the table always keeps a GM. */
  setRole(player: Player, id: string, role: Role): void {
    requireGm(player);
    const world = this.store.world;
    if (!world.players.some((p) => p.id === id)) throw new Refusal('No such player');
    const players = world.players.map((p) => (p.id === id ? { ...p, role } : p));
    if (!players.some(isGm)) throw new Refusal('The table needs a GM');
    this.store.setWorld({ ...world, players });
  }

  /** An unlinked copy of the monster's stock actor. */
  private monster(from: Extract<SpawnSource, { kind: 'monster' }>, at: Point, hidden?: boolean): Token {
    const monster = srdFor(from.rules).monsters.get(from.id);
    if (!monster) throw new Refusal(`No monster "${from.id}" in the ${from.rules} rules`);
    return this.tokenOf(this.stockActor(monster, from.rules), at, hidden);
  }

  /** The Actors list's untouched actor for a monster, made the first time it is placed. */
  private stockActor(monster: Monster, rules: Edition): Actor {
    const fresh = actorFromMonster(monster, rules, this.store.world.rules);
    const actors = this.store.actors;
    const found = [...actors.values()].find((a) => sameJson(sheetFields(a), sheetFields(fresh)));
    if (found) return found;
    const actor = { ...fresh, id: uniqueId(monster.id, (id) => actors.has(id)) };
    this.store.setActor(actor);
    return actor;
  }

  private copy(id: string, at: Point, hidden?: boolean): Token {
    const actor = this.store.actors.get(id);
    if (!actor) throw new Refusal('No such actor');
    return this.tokenOf(actor, at, hidden);
  }

  /** A new token of `actor`: unlinked copies get numbered names, linked tokens keep the actor's. */
  private tokenOf(actor: Actor, at: Point, hidden?: boolean): Token {
    const token = tokenFromActor(actor, this.placement(actor.name, actor.size, at, hidden));
    return token.linked ? { ...token, name: actor.name } : token;
  }

  /** A free id and name for a new creature, and its square. */
  private placement(name: string, size: number, at: Point, hidden?: boolean): Placement {
    const tokens = this.store.tokens;
    return {
      id: uniqueId(name, (id) => tokens.has(id)),
      name: uniqueName(
        name,
        [...tokens.values()].map((t) => t.name),
      ),
      at: placeToken(at, size, this.store.world.gridSize),
      hidden,
    };
  }
}

/** Parses GM input, turning schema problems into a refusal the GM can read. */
function valid<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const issue = r.error.issues[0]!;
  throw new Refusal(issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message);
}
