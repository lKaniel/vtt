import type { Doc } from '@vtt/core';
import { canObserve, canSee, CLOCK_COLL, isGm, type Player, sceneCollOf } from '@vtt/shared';
import type { DocAccess, OwnedDoc } from './store-access.ts';

// Which documents a player is sent (doc-feed.ts), and how much of them.
// The GM gets everything. A player gets the actors and tokens they observe,
// the journal entries they may see (limited: the title only), the roll
// tables shared with them, the playlists playing now, and on the scene they
// are on, what is drawn there for them: drawings, templates, notes, sounds
// and the regions the GM shows. Everyone gets the game clock.

export interface Viewer {
  player: Player;
  /** The scene the player is on. */
  scene: string;
}

/** Scene collections players get, and which of their documents. */
const SCENE_RULES: Partial<Record<string, (v: Viewer, access: DocAccess, doc: Doc) => boolean>> = {
  drawings: (v, _a, d) => !d.hidden || d.author === v.player.id,
  templates: (v, _a, d) => !d.hidden || d.author === v.player.id,
  sounds: (_v, _a, d) => !d.hidden,
  regions: (_v, _a, d) => !d.hidden && d.visible === true,
  notes: (v, access, d) => !d.hidden && (typeof d.entry !== 'string' || entrySeen(v, access, d.entry)),
};

function entrySeen(v: Viewer, access: DocAccess, id: string): boolean {
  const entry = access.get('journals', id);
  return !!entry && canSee(access.owned('journals', entry), v.player);
}

function playing(doc: Doc): boolean {
  return Array.isArray(doc.tracks) && (doc.tracks as { playing?: boolean }[]).some((t) => t.playing);
}

const observed = (v: Viewer, owned: OwnedDoc) => canSee(owned, v.player) && canObserve(owned, v.player);

/** Whether a player is sent a document at all. */
export function sendsTo(v: Viewer, access: DocAccess, coll: string, doc: Doc): boolean {
  if (isGm(v.player) || coll === CLOCK_COLL) return true;
  if (coll === 'actors' || coll.endsWith('/tokens')) return observed(v, access.owned(coll, doc));
  if (coll === 'journals') return canSee(access.owned(coll, doc), v.player);
  if (coll === 'tables') return observed(v, access.owned(coll, doc));
  if (coll === 'playlists') return playing(doc);
  const at = sceneCollOf(coll);
  const rule = at && SCENE_RULES[at.name];
  return !!rule && at.scene === v.scene && rule(v, access, doc);
}

/** The document as the player is sent it: a journal entry they may only know of comes without its pages. */
export function viewOf(v: Viewer, access: DocAccess, coll: string, doc: Doc): Doc {
  if (coll !== 'journals' || isGm(v.player) || canObserve(access.owned(coll, doc), v.player)) return doc;
  return { ...doc, pages: [] };
}

/** Documents whose visibility hangs on another: notes on a journal entry. */
export function dependents(access: DocAccess, coll: string, id: string): { coll: string; doc: Doc }[] {
  if (coll !== 'journals') return [];
  const all = access.all();
  return Object.entries(all)
    .filter(([c]) => c.endsWith('/notes'))
    .flatMap(([c, docs]) => docs.filter((d) => d.entry === id).map((doc) => ({ coll: c, doc })));
}
