import {
  type Actor,
  actorFromMonster,
  ActorSchema,
  applyTokenPatch,
  type Edition,
  characterOf,
  isCharacter,
  type Monster,
  type Placement,
  sameJson,
  sheetFields,
  type SpawnSource,
  contentWith,
  type Token,
  tokenFromActor,
  TokenSchema,
} from '@vtt/system-dnd5e';
import {
  canControl,
  canEdit,
  FOLDERS,
  type FolderKind,
  isGm,
  type Level,
  newFolderOps,
  lockedPatchKeys,
  placeToken,
  type Player,
  type Point,
  type Role,
  uniqueId,
  uniqueName,
  withLevel,
} from '@vtt/shared';
import type { z } from 'zod';
import type { Relink } from '../store/token-ops.ts';
import { Refusal, requireGm, type Table } from '../play/table.ts';
import { packContent } from '../library/game-packs.ts';
import { SheetDrops } from './sheet-drop-actions.ts';
import { gameMedia } from './pack-actions.ts';
import { isWildcard, OpError, pickWildcard } from '@vtt/core';
import { checkOps } from '../store/op-permissions.ts';
import type { ClientMessage } from './client-messages.ts';

type Build = Extract<ClientMessage, { t: 'build' }>;

/**
 * The GM's tools: editing any token, placing new ones, keeping the Actors
 * list and deciding who may do what. Trusted players share the editor for
 * the tokens they own.
 */
export class GmActions {
  /** Drag and drop onto sheets, for editors and (handing items over) players. */
  readonly drops: SheetDrops;

  /** The game's picture files as last read, for wildcard token images; read again after each use. */
  private media: readonly string[] = [];

  constructor(private table: Table) {
    this.drops = new SheetDrops(table);
    this.readMedia();
  }

  private readMedia(): void {
    gameMedia(this.store).then(
      (entries) => {
        this.media = entries.map((e) => e.src);
      },
      () => undefined,
    );
  }

  private get store() {
    return this.table.store;
  }

  edit(player: Player, id: string, patch: Record<string, unknown>): void {
    const token = this.store.tokens.get(id);
    if (!token) throw new Refusal('No such token');
    if (!canEdit(token, player)) throw new Refusal(`You can't edit ${token.name}`);
    const locked = lockedPatchKeys(patch, player, this.store.system.gmOnlyFields);
    if (locked.length) throw new Refusal(`Only the GM can change ${locked.join(', ')}`);
    this.store.setToken(valid(TokenSchema, applyTokenPatch(token, patch)));
  }

  delete(player: Player, id: string): void {
    requireGm(player);
    if (!this.store.tokens.has(id)) throw new Refusal('No such token');
    this.table.removeToken(id);
  }

  spawn(player: Player, from: SpawnSource, at: Point, hidden?: boolean): void {
    if (from.kind === 'actor' && !isGm(player)) return this.placeOwn(player, from.id, at);
    requireGm(player);
    this.store.setToken(from.kind === 'monster' ? this.monster(from, at, hidden) : this.copy(from.id, at, hidden));
  }

  /** A player puts a creature they own on the scene, as in Foundry: shown; a linked one once per scene. */
  private placeOwn(player: Player, id: string, at: Point): void {
    const actor = this.store.actors.get(id);
    if (!actor) throw new Refusal('No such actor');
    if (!canControl(actor, player)) throw new Refusal(`You can't place ${actor.name}`);
    const token = this.tokenOf(actor, at, false);
    if (token.linked && [...this.store.tokens.values()].some((t) => t.actor === id && t.linked)) {
      throw new Refusal(`${actor.name} is already on this map`);
    }
    this.store.setToken(token);
  }

  /** Map documents and new creatures for a scene, all or nothing (Claude's build_scene tool). */
  build(player: Player, msg: Build): void {
    requireGm(player);
    if (!this.store.docs.get('scenes', msg.scene)) throw new Refusal(`No scene "${msg.scene}"`);
    for (const s of msg.spawns) this.spawnable(s.from);
    try {
      checkOps(player, msg.ops, this.store.access);
      if (msg.ops.length) this.store.applyOps(msg.ops);
    } catch (e) {
      if (e instanceof OpError) throw new Refusal(e.message);
      throw e;
    }
    this.store.inScene(msg.scene, () => {
      for (const s of msg.spawns) this.spawn(player, s.from, s.at, s.hidden);
    });
  }

  /** Refuses a creature that can't be placed: an unknown monster or actor. */
  private spawnable(from: SpawnSource): void {
    if (from.kind === 'actor' && !this.store.actors.has(from.id)) throw new Refusal(`No actor "${from.id}"`);
    if (from.kind === 'monster' && !contentWith(from.rules, packContent(this.store)).monsters.has(from.id)) {
      throw new Refusal(`No monster "${from.id}" in the ${from.rules} rules`);
    }
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

  /** The GM saves any actor; a player one they own, leaving the GM's fields as they were. */
  saveActor(player: Player, actor: unknown): void {
    const next = valid(ActorSchema, actor);
    if (!isGm(player)) this.checkOwnActor(player, next);
    this.store.setActor(next);
  }

  private checkOwnActor(player: Player, next: Actor): void {
    const now = this.store.actors.get(next.id);
    if (!now) throw new Refusal('Only the GM can do that');
    if (!canEdit(now, player)) throw new Refusal(`You can't edit ${now.name}`);
    // Both with their defaults filled in, so a default the file leaves out isn't a change.
    const changed = changedKeys(valid(ActorSchema, now), next);
    const locked = lockedPatchKeys(changed, player, this.store.system.gmOnlyFields);
    if (locked.length) throw new Refusal(`Only the GM can change ${locked.join(', ')}`);
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

  /**
   * Gives a seat a creature to play (it owns it) or takes it away. The seat's
   * character is the first it was given; taking that one away moves it on to
   * another creature the seat still owns, or clears it.
   */
  setPlays(player: Player, id: string, actorId: string, plays: boolean): void {
    requireGm(player);
    const world = this.store.world;
    const seat = world.players.find((p) => p.id === id);
    if (!seat) throw new Refusal('No such player');
    const actor = this.store.actors.get(actorId);
    if (!actor) throw new Refusal('No such actor');
    const before = characterOf(seat, this.store.actors.values())?.id;
    this.store.setActor({ ...actor, ownership: withLevel(actor.ownership, id, plays ? 'owner' : notOwner(actor)) });
    const next = { ...seat, character: this.characterAfter(seat, before, actorId, plays) };
    if (!next.character) delete next.character;
    this.store.setWorld({ ...this.store.world, players: world.players.map((p) => (p.id === id ? next : p)) });
  }

  /** The seat's character once `actorId` is given or taken away. */
  private characterAfter(seat: Player, now: string | undefined, actorId: string, plays: boolean): string | undefined {
    if (plays) return now ?? actorId;
    if (now !== actorId) return now;
    const left = [...this.store.actors.values()].filter((a) => isCharacter(a) && canControl(a, seat));
    return left.toSorted((a, b) => a.name.localeCompare(b.name))[0]?.id;
  }

  /** An unlinked copy of the monster's stock actor. */
  private monster(from: Extract<SpawnSource, { kind: 'monster' }>, at: Point, hidden?: boolean): Token {
    const monster = contentWith(from.rules, packContent(this.store)).monsters.get(from.id);
    if (!monster) throw new Refusal(`No monster "${from.id}" in the ${from.rules} rules`);
    return this.tokenOf(this.stockActor(monster, from.rules), at, hidden);
  }

  /** The Actors list's untouched actor for a monster, made the first time it is placed. */
  private stockActor(monster: Monster, rules: Edition): Actor {
    const fresh = actorFromMonster(monster, rules, this.store.world.rules);
    const actors = this.store.actors;
    const found = [...actors.values()].find((a) => sameJson(sheetFields(a), sheetFields(fresh)));
    if (found) return found;
    const folder = fresh.folder && this.folderNamed('actors', fresh.folder);
    const actor = { ...fresh, id: uniqueId(monster.id, (id) => actors.has(id)), ...(folder ? { folder } : {}) };
    this.store.setActor(actor);
    return actor;
  }

  /** The top-level folder of a list by its name, made when there is none. */
  private folderNamed(kind: FolderKind, name: string): string {
    const top = this.store.docs.all(FOLDERS).find((f) => f.kind === kind && !f.parent && f.name === name);
    if (top) return top.id;
    const made = newFolderOps(this.store.docs, { kind, name });
    this.store.applyOps(made.ops);
    return made.id;
  }

  private copy(id: string, at: Point, hidden?: boolean): Token {
    const actor = this.store.actors.get(id);
    if (!actor) throw new Refusal('No such actor');
    return this.tokenOf(actor, at, hidden);
  }

  /** A new token of `actor`: unlinked copies get numbered names, linked tokens keep the actor's. */
  private tokenOf(actor: Actor, at: Point, hidden?: boolean): Token {
    const token = tokenFromActor(actor, this.placement(actor.name, actor.size, at, hidden));
    if (token.linked) return { ...token, name: actor.name };
    return actor.randomImg && actor.img && isWildcard(actor.img) ? { ...token, img: this.pickImg(actor.img) } : token;
  }

  /** One of the pictures a wildcard pattern matches (the pattern itself when none does yet). */
  private pickImg(pattern: string): string {
    const img = pickWildcard(pattern, this.media, this.table.rng) ?? pattern;
    this.readMedia();
    return img;
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
      at: placeToken(at, size, this.store.world),
      hidden,
    };
  }
}

/** The level a seat drops to when a creature is taken from it: everyone's, unless everyone owns it. */
function notOwner(actor: Actor): Level {
  return actor.ownership?.default === 'owner' ? 'limited' : (actor.ownership?.default ?? 'limited');
}

/** Parses GM input, turning schema problems into a refusal the GM can read. */
function valid<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const issue = r.error.issues[0]!;
  throw new Refusal(issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message);
}

/** The fields that differ between two versions of a document, as a patch-shaped record. */
function changedKeys(before: object, after: object): Record<string, true> {
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changed = [...keys].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  return Object.fromEntries(changed.map((k) => [k, true as const]));
}
