import type { ClientMessage, CompendiumDrop, Edition, SheetArea, TokenView } from '@vtt/system-dnd5e';
import type { Point } from '@vtt/shared';

// Drag and drop, as in Foundry: things from the side panel (Actors,
// Compendium, Journal, Assets) and from a character's inventory, dropped on
// the map or on a character sheet. The server decides what a drop does to a
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
  /** A journal entry: becomes a map note. */
  | { kind: 'journal'; id: string; name: string }
  /** A picture from the Assets tab, placed as a tile; `w` and `h` are its size in pixels when known. */
  | { kind: 'media'; src: string; w?: number; h?: number };

/** What the server places or hands out on the map (media and journal entries are made into tiles and notes here). */
export type MapDrop = Exclude<DragPayload, { kind: 'media' } | { kind: 'journal' }>;

export interface DropContext {
  tokens: Iterable<TokenView>;
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
  p.kind === 'item' || p.kind === 'spell' || p.kind === 'feature';

/** What dropping `payload` at `p` asks the server for, why it can't, or undefined when it does nothing. */
export function dropMessage(payload: MapDrop, p: Point, ctx: DropContext): Outcome {
  if (payload.kind === 'monster' || payload.kind === 'actor') {
    const from = payload.kind === 'monster' ? payload : { kind: payload.kind, id: payload.id };
    return { t: 'spawn', from, at: p, hidden: ctx.hidden };
  }
  const token = tokenAt(ctx.tokens, p, ctx.gridSize);
  if (payload.kind === 'carried') {
    if (!token) return { error: 'Hand it to a creature' };
    return token.id === payload.from ? undefined : give(payload, token.id);
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
  if (payload.kind === 'journal') return { error: 'Drop journal entries on the map' };
  return { error: payload.kind === 'media' ? 'Drop pictures on the map' : 'Drop creatures on the map' };
}

function give({ from, item, spell }: Extract<DragPayload, { kind: 'carried' }>, to: string): ClientMessage {
  return { t: 'give', from, to, item, ...(spell && { spell }) };
}
