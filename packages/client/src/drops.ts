import { srdFor, type ClientMessage, type Edition, type InventoryEntry, type Point, type TokenView } from '@vtt/shared';

// Dragging from the GM's Actors list and Compendium onto the map: creatures
// are placed where they land, items and spells go to the creature they land on.

/** The data type a drag from the GM's lists carries. */
export const DRAG_TYPE = 'application/x-vtt';

export type DragPayload =
  | { kind: 'monster'; id: string; rules: Edition }
  | { kind: 'actor'; id: string }
  | { kind: 'item'; id: string }
  | { kind: 'spell'; id: string; rules: Edition };

export interface DropContext {
  tokens: Iterable<TokenView>;
  gridSize: number;
  /** The world's rules edition. */
  rules: Edition;
  /** Place new creatures hidden from the players. */
  hidden: boolean;
}

/** The top creature under a point, by each token's size. */
export function tokenAt(tokens: Iterable<TokenView>, p: Point, gridSize: number): TokenView | undefined {
  let hit: TokenView | undefined;
  for (const t of tokens) {
    const half = (t.size * gridSize) / 2;
    if (Math.abs(p[0] - t.x) <= half && Math.abs(p[1] - t.y) <= half) hit = t;
  }
  return hit;
}

/** What dropping `payload` at `p` asks the server for, or why it can't. */
export function dropMessage(payload: DragPayload, p: Point, ctx: DropContext): ClientMessage | { error: string } {
  if (payload.kind === 'monster' || payload.kind === 'actor') {
    const from = payload.kind === 'monster' ? payload : { kind: payload.kind, id: payload.id };
    return { t: 'spawn', from, at: p, hidden: ctx.hidden };
  }
  const token = tokenAt(ctx.tokens, p, ctx.gridSize);
  if (!token) return { error: `Drop ${payload.kind}s on a creature` };
  return payload.kind === 'item' ? giveItem(token, payload.id) : teachSpell(token, payload, ctx.rules);
}

function giveItem(token: TokenView, item: string): ClientMessage {
  const inventory: InventoryEntry[] = [...(token.inventory ?? [])];
  const i = inventory.findIndex((e) => e.item === item);
  if (i >= 0) inventory[i] = { ...inventory[i]!, qty: inventory[i]!.qty + 1 };
  else inventory.push({ item, qty: 1, equipped: false });
  return { t: 'editToken', token: token.id, patch: { inventory } };
}

function teachSpell(token: TokenView, spell: { id: string }, worldRules: Edition) {
  const rules = token.stats?.rules ?? worldRules;
  if (!srdFor(rules).spells.has(spell.id)) {
    return { error: `${token.name} plays by the ${rules} rules, which have no such spell` };
  }
  const spells = token.stats?.spells ?? [];
  if (spells.includes(spell.id)) return { error: `${token.name} already knows that spell` };
  const message: ClientMessage = {
    t: 'editToken',
    token: token.id,
    patch: { stats: { ...token.stats, spells: [...spells, spell.id] } },
  };
  return message;
}
