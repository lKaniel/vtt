import { ancestors, canReparent, descendants, keysBetween, type Doc, type Patch } from '@vtt/core';
import type { Rect } from './chunks.ts';
import { applyPatch } from './placeables.ts';
import type { Point } from './schema.ts';

// The tile tree, like Figma's layers: tiles are stored flat, each naming its
// `parent` (a group or a container tile) and its `sort` key among siblings.
// A group has no picture or rect of its own: it spans its children. Any
// other tile can hold tiles too, as a container (a house holding its
// furniture); ground tiles (`background`) never do. Everything here works on
// one scene's tile documents and says what to change as a TileEdit.

/** What an edit of the tile tree changes; the caller turns it into ops. */
export interface TileEdit {
  creates: Doc[];
  updates: { id: string; patch: Patch }[];
  deletes: string[];
}

/** How a z-order command moves tiles among their siblings. */
export type ZOrder = 'forward' | 'backward' | 'front' | 'back';

const none = (): TileEdit => ({ creates: [], updates: [], deletes: [] });

export const isGroup = (doc: Doc): boolean => doc.kind === 'group';
const sortOf = (doc: Doc): string | undefined => doc.sort as string | undefined;
const parentOf = (doc: Doc): string | undefined => doc.parent as string | undefined;

/** Siblings in draw order: tiles without a key first, in file order, then by key. */
function siblingOrder(docs: readonly Doc[]): Doc[] {
  const index = new Map(docs.map((d, i) => [d.id, i]));
  return [...docs].sort((a, b) => {
    const [x, y] = [sortOf(a), sortOf(b)];
    if (x === y || (x === undefined && y === undefined)) return index.get(a.id)! - index.get(b.id)!;
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    return x < y ? -1 : 1;
  });
}

/** The parent a tile is drawn under: its own, unless that is missing. */
function shownParent(byId: ReadonlyMap<string, Doc>, doc: Doc): string | undefined {
  const parent = parentOf(doc);
  return parent !== undefined && byId.has(parent) && parent !== doc.id ? parent : undefined;
}

function childMap(tiles: readonly Doc[]): Map<string | undefined, Doc[]> {
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const kids = new Map<string | undefined, Doc[]>();
  for (const t of tiles) {
    const parent = shownParent(byId, t);
    kids.set(parent, [...(kids.get(parent) ?? []), t]);
  }
  return kids;
}

/** The children of `parent` (undefined: the top level), bottom to top. */
export function tileChildren(tiles: readonly Doc[], parent: string | undefined): Doc[] {
  return siblingOrder(childMap(tiles).get(parent) ?? []);
}

/** Every tile, bottom to top: each tile right under its children, depth first. */
export function tileOrder(tiles: readonly Doc[]): Doc[] {
  const kids = childMap(tiles);
  const out: Doc[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | undefined): void => {
    for (const t of siblingOrder(kids.get(parent) ?? [])) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
      walk(t.id);
    }
  };
  walk(undefined);
  return out;
}

const num = (doc: Doc, key: string): number => (doc[key] as number | undefined) ?? 0;
const ownRect = (doc: Doc): Rect => ({ x: num(doc, 'x'), y: num(doc, 'y'), w: num(doc, 'w'), h: num(doc, 'h') });

function union(rects: readonly Rect[]): Rect | undefined {
  if (!rects.length) return undefined;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: right - x, h: bottom - y };
}

/** A tile's rect; a group's spans the tiles in it (undefined when it is empty). */
export function tileBounds(tiles: readonly Doc[], id: string): Rect | undefined {
  const doc = tiles.find((t) => t.id === id);
  if (!doc) return undefined;
  if (!isGroup(doc)) return ownRect(doc);
  return union(
    descendants(tiles as Doc[], id)
      .filter((d) => !isGroup(d))
      .map(ownRect),
  );
}

/** The tiles with each group's bounds as its x, y, w and h, so groups draw and pick like rects. */
export function withGroupBounds(tiles: readonly Doc[]): Doc[] {
  return tiles.map((t) => {
    if (!isGroup(t)) return t;
    const r = tileBounds(tiles, t.id);
    return r ? { ...t, ...r } : t;
  });
}

/** The tile and its parents, nearest first. */
function chain(tiles: readonly Doc[], id: string): string[] {
  return [id, ...ancestors(tiles as Doc[], id).map((a) => a.id)];
}

/**
 * What a click on tile `leaf` selects: its outermost group or container, or,
 * inside group `scope` (double-click entered it), the child of `scope` it is in.
 */
export function pickUnit(tiles: readonly Doc[], leaf: string, scope: string | undefined): string {
  const up = chain(tiles, leaf);
  const at = scope === undefined ? -1 : up.indexOf(scope);
  return at > 0 ? up[at - 1]! : up.at(-1)!;
}

/** Locked itself or inside something locked: clicks and marquees pass through it. */
export function isTileLocked(tiles: readonly Doc[], id: string): boolean {
  const byId = new Map(tiles.map((t) => [t.id, t]));
  return chain(tiles, id).some((a) => byId.get(a)?.locked === true);
}

/** The ids plus everything inside them: what moves when they move. */
export function withDescendants(tiles: readonly Doc[], ids: readonly string[]): string[] {
  const out = new Set(ids);
  for (const id of ids) for (const d of descendants(tiles as Doc[], id)) out.add(d.id);
  return [...out];
}

const holds = (r: Rect, [x, y]: Point): boolean => x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;

/** Tiles that take tiles dropped on them: not groups, not ground. */
const canContain = (doc: Doc): boolean => !isGroup(doc) && doc.background !== true;

/** The topmost container under `p`, leaving out `exclude` and what is in it. */
export function containerAt(tiles: readonly Doc[], p: Point, exclude: ReadonlySet<string>): string | undefined {
  const out = new Set(withDescendants(tiles, [...exclude]));
  const order = tileOrder(tiles);
  for (let i = order.length - 1; i >= 0; i--) {
    const t = order[i]!;
    if (!out.has(t.id) && canContain(t) && holds(ownRect(t), p)) return t.id;
  }
  return undefined;
}

// Sort keys ------------------------------------------------------------------------

type Keys = Map<string, string>;

/** Keys for every sibling in `order`: fresh ones for all of them. */
function freshKeys(order: readonly Doc[]): Keys {
  const keys = keysBetween(null, null, order.length);
  return new Map(order.map((d, i) => [d.id, keys[i]!]));
}

/**
 * Keys that put `order` (siblings, bottom to top) in that order, changing
 * only the moved ones when the others' keys allow it.
 */
function keysFor(order: readonly Doc[], moved: ReadonlySet<string>): Keys {
  const out: Keys = new Map();
  let i = 0;
  while (i < order.length) {
    if (!moved.has(order[i]!.id)) {
      i++;
      continue;
    }
    let end = i;
    while (end < order.length && moved.has(order[end]!.id)) end++;
    const run = fillRun(order[i - 1], order[end], end - i);
    if (!run) return freshKeys(order);
    run.forEach((key, n) => out.set(order[i + n]!.id, key));
    i = end;
  }
  return out;
}

/** Keys for `n` tiles between two fixed siblings, or undefined when they leave no room. */
function fillRun(below: Doc | undefined, above: Doc | undefined, n: number): string[] | undefined {
  const lo = below ? (sortOf(below) ?? null) : null;
  if (above && sortOf(above) === undefined) return undefined;
  const hi = above ? sortOf(above)! : null;
  if (lo !== null && hi !== null && lo >= hi) return undefined;
  return keysBetween(lo, hi, n);
}

/** Updates that give `order` its keys (and `parent`, for the moved ones). */
function placeUpdates(order: readonly Doc[], moved: ReadonlySet<string>, parent?: string | null): TileEdit['updates'] {
  const keys = keysFor(order, moved);
  return order.flatMap((d) => {
    const patch: Patch = {};
    const key = keys.get(d.id);
    if (key !== undefined && key !== sortOf(d)) patch.sort = key;
    if (parent !== undefined && moved.has(d.id) && (parentOf(d) ?? null) !== parent) patch.parent = parent;
    return Object.keys(patch).length ? [{ id: d.id, patch }] : [];
  });
}

const byDrawOrder = (tiles: readonly Doc[], ids: readonly string[]): Doc[] => {
  const want = new Set(ids);
  return tileOrder(tiles).filter((t) => want.has(t.id));
};

/** The siblings under `parent` with `docs` put in at `index` (counted without them). */
function insertInto(tiles: readonly Doc[], parent: string | undefined, docs: readonly Doc[], index: number): Doc[] {
  const moving = new Set(docs.map((d) => d.id));
  const rest = tileChildren(tiles, parent).filter((t) => !moving.has(t.id));
  const at = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), ...docs, ...rest.slice(at)];
}

// Edits --------------------------------------------------------------------------

/** Groups the tiles `ids` into a new group `id`, which takes the place of the topmost of them. */
export function groupEdit(tiles: readonly Doc[], ids: readonly string[], id: string): TileEdit {
  const members = byDrawOrder(tiles, ids);
  const top = members.at(-1);
  if (!top) return none();
  const parent = shownParent(new Map(tiles.map((t) => [t.id, t])), top);
  const siblings = tileChildren(tiles, parent);
  const rest = siblings.filter((t) => !ids.includes(t.id));
  const below = siblings.slice(0, siblings.indexOf(top)).filter((t) => !ids.includes(t.id)).length;
  const created: Doc = { id, type: 'tile', rev: 0, kind: 'group', ...(parent ? { parent } : {}) };
  const order = [...rest.slice(0, below), created, ...rest.slice(below)];
  const keys = keysFor(order, new Set([id]));
  const updates = placeUpdates(order, new Set([id])).filter((u) => u.id !== id);
  const doc = { ...created, sort: keys.get(id)! };
  const inside = placeUpdates(members, new Set(members.map((m) => m.id)), id);
  return { creates: [doc], updates: merge([...updates, ...inside]), deletes: [] };
}

/** Takes the children out of each group, where the group was, and deletes the groups. */
export function ungroupEdit(tiles: readonly Doc[], ids: readonly string[]): TileEdit {
  let current = [...tiles];
  const out = none();
  for (const id of ids) {
    const g = current.find((t) => t.id === id);
    if (!g || !isGroup(g)) continue;
    const parent = shownParent(new Map(current.map((t) => [t.id, t])), g);
    const kids = tileChildren(current, id);
    const index = tileChildren(current, parent).indexOf(g);
    const order = insertInto(current, parent, kids, index).filter((t) => t.id !== id);
    const step: TileEdit = {
      creates: [],
      updates: placeUpdates(order, new Set(kids.map((k) => k.id)), parent ?? null),
      deletes: [id],
    };
    current = applyTileEdit(current, step);
    out.updates.push(...step.updates);
    out.deletes.push(id);
  }
  return { ...out, updates: merge(out.updates) };
}

/** Moves the tiles `ids` among their siblings: one step, or all the way. */
export function reorderEdit(tiles: readonly Doc[], ids: readonly string[], how: ZOrder): TileEdit {
  const chosen = new Set(ids);
  const parents = new Set(byDrawOrder(tiles, ids).map((t) => shownParent(new Map(tiles.map((d) => [d.id, d])), t)));
  const updates = [...parents].flatMap((parent) => {
    const siblings = tileChildren(tiles, parent);
    const order = reordered(siblings, chosen, how);
    const moved = new Set(siblings.filter((d) => chosen.has(d.id)).map((d) => d.id));
    return order.some((d, i) => d !== siblings[i]) ? placeUpdates(order, moved) : [];
  });
  return { creates: [], updates, deletes: [] };
}

function reordered(siblings: readonly Doc[], chosen: ReadonlySet<string>, how: ZOrder): Doc[] {
  const picked = siblings.filter((d) => chosen.has(d.id));
  const rest = siblings.filter((d) => !chosen.has(d.id));
  if (how === 'front') return [...rest, ...picked];
  if (how === 'back') return [...picked, ...rest];
  const out = [...siblings];
  const step = how === 'forward' ? 1 : -1;
  const indices = out.map((_, i) => i).filter((i) => chosen.has(out[i]!.id));
  for (const i of how === 'forward' ? indices.toReversed() : indices) {
    const j = i + step;
    if (j < 0 || j >= out.length || chosen.has(out[j]!.id)) continue;
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Groups that `edit` leaves with nothing in them, and the groups that then empties. */
function emptiedGroups(tiles: readonly Doc[], gone: ReadonlySet<string>): string[] {
  const out: string[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of tiles) {
      if (!isGroup(t) || gone.has(t.id) || out.includes(t.id)) continue;
      if (tileChildren(tiles, t.id).every((k) => gone.has(k.id) || out.includes(k.id))) {
        out.push(t.id);
        changed = true;
      }
    }
  }
  return out;
}

/**
 * Moves tiles into `parent` (undefined: the top level) at `index` among its
 * children, bottom to top; groups left empty are deleted.
 */
export function moveIntoEdit(
  tiles: readonly Doc[],
  ids: readonly string[],
  parent: string | undefined,
  index: number,
): TileEdit {
  const target = parent === undefined ? undefined : tiles.find((t) => t.id === parent);
  if (parent !== undefined && (!target || (!isGroup(target) && !canContain(target)))) return none();
  if (ids.some((id) => !canReparent(tiles, id, parent))) return none();
  const moving = byDrawOrder(tiles, ids);
  const order = insertInto(tiles, parent, moving, index);
  const updates = placeUpdates(order, new Set(ids), parent ?? null);
  const after = applyTileEdit(tiles, { creates: [], updates, deletes: [] });
  const empty = emptiedGroups(after, new Set()).filter((g) =>
    tiles.some((t) => t.id === g && tileChildren(tiles, g).length),
  );
  return { creates: [], updates, deletes: empty };
}

/**
 * After tiles moved: each that was dropped onto a container goes inside it
 * (on top), and one dragged off its container leaves it. Tiles in a group
 * stay in it.
 */
export function nestEdit(tiles: readonly Doc[], ids: readonly string[]): TileEdit {
  const moving = new Set(ids);
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const moves = new Map<string | undefined, Doc[]>();
  for (const t of byDrawOrder(tiles, ids)) {
    const parent = shownParent(byId, t);
    if (parent !== undefined && isGroup(byId.get(parent)!)) continue;
    const r = ownRect(t);
    const into = containerAt(tiles, [r.x + r.w / 2, r.y + r.h / 2], moving);
    if (into !== parent) moves.set(into, [...(moves.get(into) ?? []), t]);
  }
  const updates = [...moves].flatMap(([into, docs]) =>
    placeUpdates(insertInto(tiles, into, docs, Infinity), new Set(docs.map((d) => d.id)), into ?? null),
  );
  return { creates: [], updates: merge(updates), deletes: [] };
}

/** Where a new tile goes: into the container under its middle, on top. */
export function placeNewTile(tiles: readonly Doc[], doc: Doc): Doc {
  const r = ownRect(doc);
  const into = doc.background === true ? undefined : containerAt(tiles, [r.x + r.w / 2, r.y + r.h / 2], new Set());
  const order = insertInto(tiles, into, [doc], doc.background === true ? 0 : Infinity);
  const keys = keysFor(order, new Set([doc.id]));
  return { ...doc, ...(into ? { parent: into } : {}), sort: keys.get(doc.id)! };
}

/** Resizes a group to `to` by scaling the tiles in it. */
export function scaleGroupEdit(tiles: readonly Doc[], id: string, to: Rect): TileEdit {
  const from = tileBounds(tiles, id);
  if (!from?.w || !from.h) return none();
  const [sx, sy] = [to.w / from.w, to.h / from.h];
  const updates = descendants(tiles as Doc[], id)
    .filter((d) => !isGroup(d))
    .map((d) => {
      const r = ownRect(d);
      const patch = {
        x: Math.round(to.x + (r.x - from.x) * sx),
        y: Math.round(to.y + (r.y - from.y) * sy),
        w: Math.max(1, Math.round(r.w * sx)),
        h: Math.max(1, Math.round(r.h * sy)),
      };
      return { id: d.id, patch };
    });
  return { creates: [], updates, deletes: [] };
}

/** One update per tile, later patches winning. */
export function merge(updates: TileEdit['updates']): TileEdit['updates'] {
  const out = new Map<string, Patch>();
  for (const { id, patch } of updates) out.set(id, { ...out.get(id), ...patch });
  return [...out].map(([id, patch]) => ({ id, patch }));
}

/** The tiles with an edit applied, as the store would leave them. */
export function applyTileEdit(tiles: readonly Doc[], edit: TileEdit): Doc[] {
  const patches = new Map(merge(edit.updates).map((u) => [u.id, u.patch]));
  const gone = new Set(edit.deletes);
  const kept = tiles
    .filter((t) => !gone.has(t.id))
    .map((t) => (patches.has(t.id) ? applyPatch(t, patches.get(t.id)!) : t));
  return [...kept, ...edit.creates];
}

interface Issue {
  message: string;
  warning?: boolean;
}

/** What is wrong with where one tile sits. */
function placeIssues(byId: ReadonlyMap<string, Doc>, t: Doc): Issue[] {
  const parent = parentOf(t);
  if (parent === undefined) return [];
  const holder = byId.get(parent);
  const out: Issue[] = [];
  if (!holder) out.push({ message: `tile "${t.id}": parent "${parent}" is not a tile here` });
  else if (holder.background === true)
    out.push({ message: `tile "${t.id}": "${holder.id}" is ground and can't hold tiles` });
  if (chainLoops(byId, t.id)) out.push({ message: `tile "${t.id}" is inside itself` });
  return out;
}

/** What is wrong with a scene's tile tree, for check-game; warnings don't stop the game. */
export function tileTreeIssues(tiles: readonly Doc[]): Issue[] {
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const empty = tiles.filter((t) => isGroup(t) && !tiles.some((c) => parentOf(c) === t.id));
  return [
    ...tiles.flatMap((t) => placeIssues(byId, t)),
    ...empty.map((t) => ({ message: `group "${t.id}" holds no tiles`, warning: true })),
  ];
}

function chainLoops(byId: ReadonlyMap<string, Doc>, id: string): boolean {
  const seen = new Set<string>();
  let at: string | undefined = id;
  while (at !== undefined) {
    if (seen.has(at)) return at === id;
    seen.add(at);
    at = parentOf(byId.get(at) ?? ({} as Doc));
  }
  return false;
}
