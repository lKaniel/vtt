import type { ClientMessage, CompendiumDrop, Edition, SheetArea, TokenView } from '@vtt/system-dnd5e';
import type { Point } from '@vtt/shared';

// Drag and drop, as in Foundry: things from the side panel (Actors,
// Compendium, Journal, Assets) and from a character's inventory, dropped on
// the map or on a character sheet. Gear dropped on the ground becomes a pile
// of loot, and gear dropped on a pile goes in it (or is sold to a merchant). The server decides what a drop does to a
// sheet (system-dnd5e sheet-drops.ts) and checks who may do it.

/** The data type every drag between the panel, sheets and map carries. */
export const DRAG_TYPE = 'application/x-vtt';

export type DragPayload =
  | { kind: 'monster'; id: string; rules: Edition }
  | { kind: 'actor'; id: string }
  | { kind: 'item'; id: string }
  | { kind: 'spell'; id: string; rules: Edition }
  /** A class feature, granted on top of the class. */
  | { kind: 'feature'; id: string; class: string; rules: Edition }
  /** A stack a creature carries (a scroll: of `spell`), handed to another. */
  | { kind: 'carried'; from: string; item: string; spell?: string }
  /** A class: dropped on a sheet, it opens the level up in that class. */
  | { kind: 'class'; id: string; rules: Edition }
  /** A species: dropped on a sheet, the creature becomes one (system-dnd5e sheet-drops.ts). */
  | { kind: 'species'; id: string; rules: Edition }
  /** A journal entry: becomes a map note. */
  | { kind: 'journal'; id: string; name: string }
  /** A roll table: becomes a map note that rolls it. */
  | { kind: 'table'; id: string; name: string }
  /** A playlist: becomes a sound on the map. */
  | { kind: 'playlist'; id: string }
  /** A picture from the Assets tab, placed as a tile; `w` and `h` are its size in pixels when known. */
  | { kind: 'media'; src: string; w?: number; h?: number }
  /** A prefab from a pack's compendium (the Baileywiki library), placed where it is let go. */
  | ({ kind: 'prefab' } & PrefabRef);

/** Where a prefab lives: a pack's compendium, by its id. */
export interface PrefabRef {
  pack: string;
  compendium: string;
  id: string;
}

/** Starts dragging `payload` from a list or sheet. */
export function startDrag(e: React.DragEvent, payload: DragPayload): void {
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'copy';
}

/** Drops the session makes into tiles, notes and sounds itself (session-drops.ts). */
type Placed = { kind: 'media' } | { kind: 'journal' } | { kind: 'table' } | { kind: 'playlist' } | { kind: 'prefab' };

/** What the server places or hands out on the map. */
export type MapDrop = Exclude<DragPayload, Placed>;

export interface DropContext {
  /** An array, not a one-pass iterator: a drop looks through it more than once. */
  tokens: readonly TokenView[];
  gridSize: number;
  /** Place new creatures hidden from the players. */
  hidden: boolean;
}

/** A token's sheet, or an actor's in the Actors list. */
export interface SheetRef {
  kind: 'token' | 'actor';
  id: string;
}

type Outcome = ClientMessage | { error: string } | undefined;

/** The top creature under a point, by each token's size. */
export function tokenAt(tokens: Iterable<TokenView>, p: Point, gridSize: number): TokenView | undefined {
  let hit: TokenView | undefined;
  for (const t of tokens) {
    const half = (t.size * gridSize) / 2;
    if (Math.abs(p[0] - t.x) <= half && Math.abs(p[1] - t.y) <= half) hit = t;
  }
  return hit;
}

const compendium = (p: DragPayload): p is CompendiumDrop & DragPayload =>
  p.kind === 'item' || p.kind === 'spell' || p.kind === 'feature' || p.kind === 'species';

/** What dropping `payload` at `p` asks the server for, why it can't, or undefined when it does nothing. */
export function dropMessage(payload: MapDrop, p: Point, ctx: DropContext): Outcome {
  if (payload.kind === 'monster' || payload.kind === 'actor') {
    const from = payload.kind === 'monster' ? payload : { kind: payload.kind, id: payload.id };
    return { t: 'spawn', from, at: p, hidden: ctx.hidden };
  }
  if (payload.kind === 'class') return { error: 'Drop classes on a character sheet' };
  const token = tokenAt(ctx.tokens, p, ctx.gridSize);
  if (payload.kind === 'carried') {
    if (token?.id === payload.from) return undefined;
    return !token || token.pile ? trade(payload, ctx.tokens, token?.id) : give(payload, token.id);
  }
  if (!token) return { error: `Drop ${payload.kind}s on a creature` };
  return { t: 'drop', what: payload, onto: { kind: 'token', id: token.id } };
}

/** What dropping `payload` on a sheet (on its `area`, if on one) asks the server for. */
export function sheetDropMessage(payload: DragPayload, onto: SheetRef, area?: SheetArea): Outcome {
  if (compendium(payload)) return { t: 'drop', what: payload, onto, ...(area && { area }) };
  if (payload.kind === 'carried') {
    if (onto.kind === 'actor') return { error: 'Hand it to a creature on the map' };
    return payload.from === onto.id ? undefined : give(payload, onto.id);
  }
  if (payload.kind === 'media' && onto.kind === 'token') {
    return { t: 'editToken', token: onto.id, patch: { img: payload.src } };
  }
  return { error: ON_MAP[payload.kind] ?? 'Drop creatures on the map' };
}

/** What a sheet says to things that belong on the map. */
const ON_MAP: Partial<Record<DragPayload['kind'], string>> = {
  journal: 'Drop journal entries on the map',
  table: 'Drop roll tables on the map',
  playlist: 'Drop playlists on the map',
  media: 'Drop pictures on the map',
  prefab: 'Drop prefabs on the map',
};

/** A carried item dropped on the ground (a new pile there) or into a pile (see system-dnd5e piles.ts). */
function trade(
  { from, item, spell }: Extract<DragPayload, { kind: 'carried' }>,
  tokens: readonly TokenView[],
  to?: string,
): Outcome {
  const owner = tokens.find((t) => t.id === from);
  const index = owner?.inventory?.findIndex((e) => e.item === item && e.spell === spell) ?? -1;
  if (index < 0) return { error: `${owner?.name ?? 'It'} doesn’t carry that` };
  return { t: 'trade', from, ...(to && { to }), item: index };
}

function give({ from, item, spell }: Extract<DragPayload, { kind: 'carried' }>, to: string): ClientMessage {
  return { t: 'give', from, to, item, ...(spell && { spell }) };
}
