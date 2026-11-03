import type { Doc } from '@vtt/core';
import {
  canObserve,
  canSee,
  CLOCK_COLL,
  FOLDERS,
  folderSeen,
  foldersAbove,
  isFolderKind,
  isGm,
  isScriptMacro,
  type Player,
  sceneCollOf,
} from '@vtt/shared';
import type { DocAccess, OwnedDoc } from './store-access.ts';

// Which documents a player is sent (doc-feed.ts), and how much of them.
// The GM gets everything. A player gets the actors and tokens they observe,
// the journal entries they may see (limited: the title only), the roll
// tables and chat macros shared with them (and their own macros; script macros are the GM's alone), the
// card stacks they may see (limited: how many cards), the playlists playing now, and on the scene they
// are on, what is drawn there for them: drawings, templates, notes, sounds
// and the regions the GM shows. Everyone gets the game clock, and the
// folders that hold something they get.

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

/** Sidebar documents a player is sent once they may observe them. */
const OBSERVED = new Set(['tables', 'macros', 'homebrew']);

const observed = (v: Viewer, owned: OwnedDoc) => canSee(owned, v.player) && canObserve(owned, v.player);

/** Roll tables, chat macros and homebrew shared with the player; script macros are the GM's alone. */
const sidebarSent = (v: Viewer, access: DocAccess, coll: string, doc: Doc) =>
  !(coll === 'macros' && isScriptMacro(doc)) && observed(v, access.owned(coll, doc));

/** The documents as folders.ts reads them. */
const listed = (access: DocAccess) => ({ get: access.get.bind(access), all: access.list.bind(access) });

type Rule = (v: Viewer, access: DocAccess, doc: Doc, coll: string) => boolean;

/** The game's own collections players may get, and which of their documents. */
const GAME_RULES: Partial<Record<string, Rule>> = {
  actors: (v, access, doc, coll) => observed(v, access.owned(coll, doc)),
  journals: (v, access, doc, coll) => canSee(access.owned(coll, doc), v.player),
  cards: (v, access, doc, coll) => canSee(access.owned(coll, doc), v.player),
  playlists: (_v, _a, doc) => playing(doc),
  [FOLDERS]: (v, access, doc) => folderSeen(listed(access), doc, (c, d) => sendsTo(v, access, c, d)),
  ...Object.fromEntries(
    [...OBSERVED].map((c): [string, Rule] => [c, (v, access, doc, coll) => sidebarSent(v, access, coll, doc)]),
  ),
};

/** Whether a player is sent a document at all. */
export function sendsTo(v: Viewer, access: DocAccess, coll: string, doc: Doc): boolean {
  if (isGm(v.player) || coll === CLOCK_COLL) return true;
  const own = GAME_RULES[coll];
  if (own) return own(v, access, doc, coll);
  if (coll.endsWith('/tokens')) return observed(v, access.owned(coll, doc));
  const at = sceneCollOf(coll);
  const rule = at && SCENE_RULES[at.name];
  return !!rule && at.scene === v.scene && rule(v, access, doc);
}

/**
 * The document as the player is sent it: a journal entry they may only know
 * of comes without its pages, and cards they may not look at (a deck,
 * another's hand) as a count.
 */
export function viewOf(v: Viewer, access: DocAccess, coll: string, doc: Doc): Doc {
  if (!LIMITED_VIEW.has(coll) || isGm(v.player) || canObserve(access.owned(coll, doc), v.player)) return doc;
  if (coll === 'journals') return { ...doc, pages: [] };
  return { ...doc, cards: [], count: Array.isArray(doc.cards) ? doc.cards.length : 0 };
}

const LIMITED_VIEW = new Set(['journals', 'cards']);

/** Documents whose visibility hangs on another: notes on a journal entry, the folders a document or folder is in. */
export function dependents(access: DocAccess, coll: string, id: string): { coll: string; doc: Doc }[] {
  return [...notesOn(access, coll, id), ...foldersHolding(access, coll, id)];
}

function notesOn(access: DocAccess, coll: string, id: string): { coll: string; doc: Doc }[] {
  if (coll !== 'journals') return [];
  const all = access.all();
  return Object.entries(all)
    .filter(([c]) => c.endsWith('/notes'))
    .flatMap(([c, docs]) => docs.filter((d) => d.entry === id).map((doc) => ({ coll: c, doc })));
}

/** The folders above a document (or a folder) as it is now. */
function foldersHolding(access: DocAccess, coll: string, id: string): { coll: string; doc: Doc }[] {
  if (coll !== FOLDERS && !isFolderKind(coll)) return [];
  const doc = access.get(coll, id);
  const above = doc && (coll === FOLDERS ? doc.parent : doc.folder);
  if (typeof above !== 'string') return [];
  return foldersAbove(listed(access), above).map((f) => ({ coll: FOLDERS, doc: f }));
}
