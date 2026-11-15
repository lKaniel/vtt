import type { Doc, DocStore, Op } from '@vtt/core';
import {
  type Actor,
  linkKeepingToken,
  linkToken,
  newActorFor,
  resetToken,
  resolveToken,
  saveTokenToActor,
  splitToken,
  standaloneEntry,
  type Token,
  type TokenEntry,
  unlinkToken,
} from '@vtt/system-dnd5e';
import {
  type Chunk,
  type ChunkChange,
  intoPart,
  type MapCollection,
  type Relink,
  type ScenePart,
  uniqueId,
} from '@vtt/shared';
import { diffOps, fromDoc, toDoc } from './doc-sync.ts';
import { ACTORS, MAP, TYPE } from './store-colls.ts';

// The ops that store tokens and their actors (see token-link.ts in shared):
// a changed token is split into its entry and, for linked tokens, its actor.
// Also the ops for map edits given as whole chunks.

/** What the GM can do to a token's tie to its actor (see protocol.ts). */
export type { Relink } from '@vtt/shared';

/** Ops that create `doc`, or update it to match; none when it is already so. */
export function putOps(docs: DocStore, coll: string, doc: Doc): Op[] {
  const old = docs.get(coll, doc.id);
  return diffOps(coll, old ? [old] : [], [doc]);
}

function entryOf(docs: DocStore, coll: string, id: string): TokenEntry | undefined {
  const doc = docs.get(coll, id);
  return doc && fromDoc<TokenEntry>(doc);
}

function saveOps(docs: DocStore, coll: string, entry: TokenEntry, actor: Actor | undefined): Op[] {
  return [...(actor ? putOps(docs, ACTORS, toDoc('actor', actor)) : []), ...putOps(docs, coll, toDoc('token', entry))];
}

/** Ops that save a changed token in scene collection `coll`. */
export function tokenOps(docs: DocStore, coll: string, token: Token, actors: ReadonlyMap<string, Actor>): Op[] {
  const split = splitToken(token, entryOf(docs, coll, token.id), token.actor ? actors.get(token.actor) : undefined);
  return saveOps(docs, coll, split.entry, split.actor);
}

interface Relinked {
  entry: TokenEntry;
  actor?: Actor;
}
const RELINK: Record<Exclude<Relink, 'new'>, (entry: TokenEntry, actor: Actor) => Relinked> = {
  link: (entry) => ({ entry: linkToken(entry) }),
  unlink: (entry, actor) => ({ entry: unlinkToken(entry, actor) }),
  reset: (entry) => ({ entry: resetToken(entry) }),
  save: saveTokenToActor,
  keep: linkKeepingToken,
};

/** Ops that change a token's tie to its actor, or (`new`) give a token without one a new actor. */
export function relinkOps(
  docs: DocStore,
  coll: string,
  { id, how }: { id: string; how: Relink },
  actors: ReadonlyMap<string, Actor>,
): Op[] {
  const entry = entryOf(docs, coll, id);
  if (entry && how === 'new') return newActorOps(docs, coll, entry, actors);
  const actor = entry?.actor ? actors.get(entry.actor) : undefined;
  if (!entry || !actor || how === 'new') return [];
  const next = RELINK[how](entry, actor);
  return saveOps(docs, coll, next.entry, next.actor);
}

/** Ops that make a token without an actor into a new actor, named after it and linked to it. */
function newActorOps(docs: DocStore, coll: string, entry: TokenEntry, actors: ReadonlyMap<string, Actor>): Op[] {
  const { token } = resolveToken(entry, undefined);
  if (!token || entry.actor) return [];
  const made = newActorFor(
    token,
    uniqueId(token.name, (x) => actors.has(x)),
  );
  return saveOps(docs, coll, made.entry, made.actor);
}

/** Ops that make every token of actor `id`, on each of `scenes`, carry the actor's sheet itself. */
export function unlinkActorOps(docs: DocStore, scenes: readonly string[], id: string, actor: Actor | undefined): Op[] {
  return scenes.flatMap((scene) => {
    const coll = `${scene}/tokens`;
    return docs
      .all(coll)
      .filter((d) => d.actor === id)
      .flatMap((d) => {
        const { token } = resolveToken(fromDoc<TokenEntry>(d), actor);
        return token ? putOps(docs, coll, toDoc('token', standaloneEntry(token))) : [];
      });
  });
}

/** Before a client's deletes of actors: ops that leave those actors' tokens carrying their sheets. */
export function actorDeleteOps(
  docs: DocStore,
  scenes: readonly string[],
  ops: readonly Op[],
  actors: ReadonlyMap<string, Actor>,
): Op[] {
  return ops.flatMap((op) =>
    op.op === 'delete' && op.coll === ACTORS ? unlinkActorOps(docs, scenes, op.id, actors.get(op.id)) : [],
  );
}

/** Where a scene's map is saved: its own collections, and those of the scenes laid on it (scene-parts.ts). */
export interface MapHome {
  id: string;
  parts: readonly ScenePart[];
}

interface MapItem {
  id: string;
  z?: number;
  part?: string;
}

/** The collection an item of a scene's map is saved in, and the item as saved there: a part's item goes back to its part. */
function savedIn(
  scene: MapHome,
  coll: MapCollection,
  { z: _z, ...item }: MapItem,
): { name: string; item: { id: string } } {
  const part = item.part === undefined ? undefined : scene.parts.find((p) => p.scene === item.part);
  if (part) return { name: `${part.scene}/${coll}`, item: intoPart(coll, item as never, part) };
  const { part: _part, ...own } = item;
  return { name: `${scene.id}/${coll}`, item: own };
}

/**
 * The ops that save map edits given as whole chunks: every item of the new
 * chunks is put, and those the old chunks held that are gone are deleted.
 */
export function chunkOps(
  docs: DocStore,
  scene: MapHome,
  changes: readonly ChunkChange[],
  chunks: ReadonlyMap<string, Chunk>,
): Op[] {
  return MAP.flatMap((coll) => {
    const items = (chunk: Chunk | undefined): MapItem[] => chunk?.[coll] ?? [];
    // `z` is where a tile draws, worked out when the scene is streamed: not saved.
    const wanted = changes.flatMap((c) => items(c.chunk)).map((item) => savedIn(scene, coll, item));
    const kept = new Set(wanted.map((w) => `${w.name}\u0000${w.item.id}`));
    const current = changes.flatMap((c) => items(chunks.get(c.key))).map((item) => savedIn(scene, coll, item));
    const gone = current.filter((c) => !kept.has(`${c.name}\u0000${c.item.id}`) && docs.get(c.name, c.item.id));
    return [
      ...wanted.flatMap((w) => putOps(docs, w.name, toDoc(TYPE[coll], w.item))),
      ...gone.map((c): Op => ({ op: 'delete', coll: c.name, id: c.item.id })),
    ];
  });
}
