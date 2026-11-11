import { type RollChoice, RollChoiceSchema, type RollEdge } from '@vtt/system-dnd5e';

// The roll pick a player has out for their creature (session-pick.ts on the
// client), kept here for the rolls the server makes on its own: initiative
// as a fight starts and death saves as a turn comes. Using it spends it, and
// the player who picked it is told so their pick goes back to normal.

interface Picked {
  edge: RollEdge;
  by: string;
}

export class RollPicks {
  private picks = new Map<string, Picked>();
  /** Tells player `by` their pick was used (set by the game). */
  spent?: (by: string) => void;

  /** `by` picks `edge` for `token`'s next roll; none: back to normal. */
  set(token: string, edge: RollEdge | undefined, by: string): void {
    if (edge) this.picks.set(token, { edge, by });
    else this.picks.delete(token);
  }

  /** The edge picked for `token`'s roll now, spent. */
  take(token: string): RollEdge | undefined {
    const picked = this.picks.get(token);
    if (!picked) return undefined;
    this.picks.delete(token);
    this.spent?.(picked.by);
    return picked.edge;
  }
}

/** An initiative roll's advantage and disadvantage: the player's pick, and a surprise's disadvantage. */
export function pickedEdge(
  edge: RollEdge | undefined,
  surprised = false,
): { advantage: boolean; disadvantage: boolean } {
  return { advantage: edge === 'advantage', disadvantage: surprised || edge === 'disadvantage' };
}

/** The roll pick sent with a message: the quick pick's, and all the roll dialog adds. */
export const rollPickOf = (msg: RollChoice): RollChoice => RollChoiceSchema.parse(msg);
