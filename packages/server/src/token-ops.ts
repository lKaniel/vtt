import type { Doc, DocStore, Op } from '@vtt/core';
import {
  linkToken,
  resetToken,
  resolveToken,
  saveTokenToActor,
  splitToken,
  standaloneEntry,
  unlinkToken,
  type Actor,
  type Token,
  type TokenEntry,
} from '@vtt/shared';
import { diffOps, fromDoc, toDoc } from './doc-sync.ts';
import { ACTORS } from './store-colls.ts';

// The ops that store tokens and their actors (see token-link.ts in shared):
// a changed token is split into its entry and, for linked tokens, its actor.

/** What the GM can do to a token's tie to its actor. */
export type Relink = 'link' | 'unlink' | 'save' | 'reset';

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

const RELINK = { link: linkToken, unlink: unlinkToken, reset: resetToken };

/** Ops that change a token's tie to its actor; none when it has no actor. */
export function relinkOps(
  docs: DocStore,
  coll: string,
  { id, how }: { id: string; how: Relink },
  actors: ReadonlyMap<string, Actor>,
): Op[] {
  const entry = entryOf(docs, coll, id);
  const actor = entry?.actor ? actors.get(entry.actor) : undefined;
  if (!entry || !actor) return [];
  if (how !== 'save') return saveOps(docs, coll, RELINK[how](entry), undefined);
  const saved = saveTokenToActor(entry, actor);
  return saveOps(docs, coll, saved.entry, saved.actor);
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
