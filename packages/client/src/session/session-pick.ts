import type { CritChoice, RollChoice, RollEdge } from '@vtt/system-dnd5e';

// What you pick for your next roll, as Foundry's roll dialog offers it:
// advantage or disadvantage on the d20, and a critical hit forced or held
// back on an attack's damage. It goes with the next roll that can use it,
// then it is back to normal. Reached as `session.pick`.

export class RollPick {
  edge?: RollEdge;
  crit?: CritChoice;

  constructor(private readonly on: { changed(): void }) {}

  /** Picks for the next roll; picking what is already picked (or undefined) is normal again. */
  set(pick: RollChoice): void {
    if ('edge' in pick) this.edge = pick.edge === this.edge ? undefined : pick.edge;
    if ('crit' in pick) this.crit = pick.crit === this.crit ? undefined : pick.crit;
    this.on.changed();
  }

  /** The whole pick, for an attack, and back to normal. */
  take(): RollChoice {
    const pick = { ...(this.edge && { edge: this.edge }), ...(this.crit && { crit: this.crit }) };
    this.clear(!!(this.edge ?? this.crit), () => {
      this.edge = undefined;
      this.crit = undefined;
    });
    return pick;
  }

  /** Only the advantage or disadvantage, for a check or save; a critical waits for the next attack. */
  takeEdge(): Pick<RollChoice, 'edge'> {
    const pick = this.edge ? { edge: this.edge } : {};
    this.clear(!!this.edge, () => (this.edge = undefined));
    return pick;
  }

  private clear(any: boolean, reset: () => void): void {
    if (!any) return;
    reset();
    this.on.changed();
  }
}
