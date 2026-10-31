import {
  ActorSchema,
  applyTokenPatch,
  placeToken,
  srdFor,
  tokenFromActor,
  tokenFromMonster,
  TokenSchema,
  uniqueId,
  uniqueName,
  type Placement,
  type Player,
  type Point,
  type SpawnSource,
  type Token,
} from '@vtt/shared';
import type { z } from 'zod';
import { Refusal, requireGm, type Table } from './table.ts';

/** The GM's tools: editing any token, placing new ones and keeping the Actors list. */
export class GmActions {
  constructor(private table: Table) {}

  private get store() {
    return this.table.store;
  }

  edit(player: Player, id: string, patch: Record<string, unknown>): void {
    requireGm(player);
    const token = this.store.tokens.get(id);
    if (!token) throw new Refusal('No such token');
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

  saveActor(player: Player, actor: unknown): void {
    requireGm(player);
    this.store.setActor(valid(ActorSchema, actor));
  }

  deleteActor(player: Player, id: string): void {
    requireGm(player);
    this.store.removeActor(id);
  }

  private monster(from: Extract<SpawnSource, { kind: 'monster' }>, at: Point, hidden?: boolean): Token {
    const monster = srdFor(from.rules).monsters.get(from.id);
    if (!monster) throw new Refusal(`No monster "${from.id}" in the ${from.rules} rules`);
    const place = this.placement(monster.name, monster.size, at, hidden);
    return tokenFromMonster(monster, { ...place, rules: from.rules }, this.store.world.rules);
  }

  private copy(id: string, at: Point, hidden?: boolean): Token {
    const actor = this.store.actors.get(id);
    if (!actor) throw new Refusal('No such actor');
    return tokenFromActor(actor, this.placement(actor.name, actor.size, at, hidden));
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
