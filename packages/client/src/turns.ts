import { actsNow, type Combat, currentTurn, takers, type TokenView } from '@vtt/system-dnd5e';

// Whose turn it is in the fight, as the session asks it (session.ts).

/** Whether you control a creature. */
type Mine = (token: TokenView) => boolean;

/** The token whose turn it is in the fight. */
export function turnToken(combat: Combat | null, tokens: ReadonlyMap<string, TokenView>): TokenView | undefined {
  const id = combat ? currentTurn(combat) : undefined;
  return id ? tokens.get(id) : undefined;
}

/** One of your creatures may act now (its turn, or it shares the party's). */
export function isMyTurn(combat: Combat | null, tokens: ReadonlyMap<string, TokenView>, mine: Mine): boolean {
  if (!combat) return false;
  return takers(combat).some((id) => {
    const token = tokens.get(id);
    return !!token && actsNow(combat, id) && mine(token);
  });
}

/** Feet the token may still walk: unlimited outside a fight, nothing when it's not its turn. */
export function movementLeft(combat: Combat | null, tokens: ReadonlyMap<string, TokenView>, id: string): number {
  if (!combat?.order.some((e) => e.token === id)) return Infinity;
  if (!actsNow(combat, id)) return 0;
  if (currentTurn(combat) === id) return combat.left.move;
  const token = tokens.get(id);
  return combat.side[id]?.move ?? token?.sheet?.speed ?? token?.speed ?? 0;
}
