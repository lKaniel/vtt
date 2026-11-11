import { isGm, type Player } from '@vtt/shared';
import type { ClientMessage, Combat, D20Mode, ServerMessage, TokenView } from '@vtt/system-dnd5e';
import { pickedMessage, planFor, type RollPicked, type RollPlan } from '../play/roll-plan.ts';
import { readPref, writePref } from '../prefs.ts';
import type { SessionPart } from './session-part.ts';

// The roll dialog: whatever you do that rolls a d20 or spends part of your
// turn (an attack, a spell, a feature, a check or save) waits here first.
// The dialog shows what it will spend, how the d20 would be rolled as
// things stand (asked of the server), and takes a situational modifier and
// the damage; confirming sends the action with what you changed. It is on
// for players until they turn it off, and off for the GM, who rolls for a
// whole table of monsters, until they turn it on. Reached as `session.rolls`.

/** What the dialog needs of the session. */
export interface RollDialogHost {
  readonly tokens: ReadonlyMap<string, TokenView>;
  readonly combat?: Combat | null;
  readonly you?: Player;
}

const PREF = 'roll-dialog';

/** Whether the dialog asks before a seat has chosen: players are asked, the GM is not. */
export const asksByDefault = (you: Player | undefined): boolean => !you || !isGm(you);

export class RollDialog implements SessionPart {
  /** The action waiting for your picks, and what the dialog offers for it. */
  plan?: RollPlan;
  /** How its d20 would be rolled as things stand, once the server has said. */
  d20?: D20Mode;
  /** Counts the dialogs shown, so an answer for an earlier one is told apart. */
  shown = 0;
  /** Your choice this session, before the stored one. */
  private chosen?: boolean;

  constructor(
    private readonly s: RollDialogHost,
    private readonly on: { changed(): void },
    private readonly post: (msg: ClientMessage) => void,
  ) {}

  /** Whether actions wait for the dialog. */
  get enabled(): boolean {
    if (this.chosen !== undefined) return this.chosen;
    const fallback = asksByDefault(this.s.you) ? 'on' : 'off';
    return readPref(PREF, ['on', 'off'], fallback) === 'on';
  }

  setEnabled(on: boolean): void {
    this.chosen = on;
    writePref(PREF, on ? 'on' : 'off');
    this.on.changed();
  }

  /** True when `msg` now waits for the dialog; false: send it as it is. */
  holds(msg: ClientMessage): boolean {
    const plan = this.enabled ? planFor(msg, { tokens: this.s.tokens, fighting: !!this.s.combat }) : undefined;
    if (!plan) return false;
    this.plan = plan;
    this.d20 = undefined;
    this.shown += 1;
    if (plan.ask) this.post({ t: 'rollDefaults', ref: `${this.shown}`, roll: plan.ask });
    this.on.changed();
    return true;
  }

  /** Sends the waiting action with what you picked. */
  confirm(picked: RollPicked): void {
    const { plan } = this;
    if (!plan) return;
    this.plan = undefined;
    this.post(pickedMessage(plan, picked, this.d20));
    this.on.changed();
  }

  /** Puts the waiting action away unsent. */
  cancel(): void {
    if (!this.plan) return;
    this.plan = undefined;
    this.on.changed();
  }

  receive(msg: ServerMessage): boolean | undefined {
    if (msg.t !== 'rollDefaults') return undefined;
    if (!this.plan || msg.ref !== `${this.shown}`) return false;
    this.d20 = msg.d20;
    return true;
  }
}
