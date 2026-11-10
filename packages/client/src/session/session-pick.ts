import type { ClientMessage, CritChoice, RollChoice, RollEdge, ServerMessage } from '@vtt/system-dnd5e';
import type { SessionPart } from './session-part.ts';

// What you pick for your next roll, as Foundry's roll dialog offers it:
// advantage or disadvantage on the d20, and a critical hit forced or held
// back on an attack's damage. It goes with the next roll that can use it,
// then it is back to normal. The server is told the advantage picked for
// the selected creature too, for the rolls it makes itself (initiative, a
// death save), and says when it used it. Shift held gives a roll advantage
// and Ctrl (or Cmd) disadvantage, without picking it. Reached as
// `session.actions.pick`.

/** What the pick needs of the session: telling the server, and the creature selected. */
export interface PickHost {
  readonly selected?: string;
  send(msg: ClientMessage): void;
}

/** The modifier keys of a key or pointer event. */
export interface HeldKeys {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export class RollPick implements SessionPart {
  edge?: RollEdge;
  crit?: CritChoice;
  /** The edge the keys held give the next roll. */
  private held?: RollEdge;
  /** The creature the server holds the picked edge for. */
  private told?: string;

  constructor(
    private readonly on: { changed(): void },
    private readonly s?: PickHost,
  ) {}

  /** Picks for the next roll; picking what is already picked (or undefined) is normal again. */
  set(pick: RollChoice): void {
    if ('edge' in pick) this.setEdge(pick.edge === this.edge ? undefined : pick.edge);
    if ('crit' in pick) this.crit = pick.crit === this.crit ? undefined : pick.crit;
    this.on.changed();
  }

  /** The modifier keys held now: Shift advantage, Ctrl or Cmd disadvantage, both normal. */
  hold(keys: HeldKeys): void {
    const dis = keys.ctrlKey || keys.metaKey;
    if (keys.shiftKey === dis) this.held = undefined;
    else this.held = keys.shiftKey ? 'advantage' : 'disadvantage';
  }

  /** The whole pick, for an attack, and back to normal. */
  take(): RollChoice {
    const edge = this.edge ?? this.held;
    const pick = { ...(edge && { edge }), ...(this.crit && { crit: this.crit }) };
    this.clear(!!(this.edge ?? this.crit), () => {
      this.setEdge(undefined);
      this.crit = undefined;
    });
    return pick;
  }

  /** Only the advantage or disadvantage, for a check or save; a critical waits for the next attack. */
  takeEdge(): Pick<RollChoice, 'edge'> {
    const edge = this.edge ?? this.held;
    this.clear(!!this.edge, () => this.setEdge(undefined));
    return edge ? { edge } : {};
  }

  /** The server rolled with the picked edge: it is back to normal. */
  receive(msg: ServerMessage): boolean | undefined {
    if (msg.t !== 'pickSpent') return undefined;
    this.told = undefined;
    this.edge = undefined;
    return true;
  }

  private setEdge(edge: RollEdge | undefined): void {
    this.edge = edge;
    const token = edge ? this.s?.selected : this.told;
    if (token) this.s?.send({ t: 'rollPick', token, ...(edge && { edge }) });
    this.told = edge ? token : undefined;
  }

  private clear(any: boolean, reset: () => void): void {
    if (!any) return;
    reset();
    this.on.changed();
  }
}
