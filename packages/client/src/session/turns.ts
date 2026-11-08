import { actsNow, type Combat, currentTurn, takers, type TokenView } from '@vtt/system-dnd5e';

// Whose turn it is in the fight, as `session.turns`.

/** What the turns need of the session: the fight, the tokens, and which are yours. */
export interface TurnHost {
  readonly combat: Combat | null;
  readonly tokens: ReadonlyMap<string, TokenView>;
  canControl(token: TokenView): boolean;
}

/** Whose turn it is, as `session.turns`. */
export class Turns {
  constructor(private readonly s: TurnHost) {}

  /** The token whose turn it is in the fight. */
  current(): TokenView | undefined {
    const id = this.s.combat ? currentTurn(this.s.combat) : undefined;
    return id ? this.s.tokens.get(id) : undefined;
  }

  /** One of your creatures may act now (its turn, or it shares the party's). */
  mine(): boolean {
    return this.yours().length > 0;
  }

  /** Whose turn End turn ends: `selected` when it may act now and is yours, else the first of yours that may. */
  ending(selected: string | undefined): string | undefined {
    const yours = this.yours();
    return selected && yours.includes(selected) ? selected : yours[0];
  }

  /**
   * Whom to hand you as the fight changes from `before`: yours whose turn
   * just started, or on a shared turn the next of yours once `selected` has
   * ended its part.
   */
  handOff(before: Combat | null, selected: string | undefined): string | undefined {
    const combat = this.s.combat;
    const token = this.current();
    if (!combat || !token) return undefined;
    const same = before?.round === combat.round && currentTurn(before) === token.id;
    if (!same) return this.s.canControl(token) ? token.id : undefined;
    return selected && combat.done?.includes(selected) ? this.ending(undefined) : undefined;
  }

  /** Your creatures taking the turn that haven't ended theirs. */
  private yours(): string[] {
    const combat = this.s.combat;
    if (!combat) return [];
    return takers(combat).filter((id) => {
      const token = this.s.tokens.get(id);
      return !!token && actsNow(combat, id) && this.s.canControl(token);
    });
  }

  /** Feet the token may still walk: unlimited outside a fight, nothing when it's not its turn. */
  movementLeft(id: string): number {
    const combat = this.s.combat;
    if (!combat?.order.some((e) => e.token === id)) return Infinity;
    if (!actsNow(combat, id)) return 0;
    if (currentTurn(combat) === id) return combat.left.move;
    const token = this.s.tokens.get(id);
    return combat.side[id]?.move ?? token?.sheet?.speed ?? token?.speed ?? 0;
  }
}
