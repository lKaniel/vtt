import type { Player } from '@vtt/shared';
import {
  type Combat,
  isLairTurn,
  moveInOrder,
  previousTurn,
  rerollInitiative,
  setRound,
  turnTo,
} from '@vtt/system-dnd5e';
import type { CombatActions } from './combat-actions.ts';
import { pickedEdge } from '../play/roll-picks.ts';
import { Refusal, requireGm, type Table } from '../play/table.ts';

// The GM running a fight by hand, past the rules: whose turn it is right
// now, a step back to the turn before, the round, and a creature's place in
// the order, and initiative rolled again. (Initiative, who fights and what a turn has left are the HUD's,
// hud-actions.ts; ending a turn is `endTurn`, which the GM may do for anyone.)

export type FightMessage =
  | { t: 'turnTo'; token: string }
  | { t: 'turnBack' }
  | { t: 'round'; value: number }
  | { t: 'orderMove'; token: string; by: number }
  | { t: 'reroll'; tokens?: string[] };

export class FightControl {
  constructor(
    private table: Table,
    private combat: CombatActions,
  ) {}

  handle(player: Player, msg: FightMessage): void {
    requireGm(player);
    const fight = this.table.store.combat;
    if (!fight) throw new Refusal('There is no fight going on');
    if (msg.t === 'turnTo') this.give(turnTo(fight, this.inOrder(fight, msg.token), this.table.turnInfo));
    else if (msg.t === 'turnBack') this.give(previousTurn(fight, this.table.turnInfo));
    else if (msg.t === 'round') this.round(fight, msg.value);
    else if (msg.t === 'reroll') this.reroll(fight, msg.tokens);
    else this.table.store.setCombat(moveInOrder(fight, this.inOrder(fight, msg.token), msg.by));
  }

  /** New initiative for the creatures named (else everyone but the lair), with their picked advantage; the log says what each rolled. */
  private reroll(fight: Combat, tokens?: readonly string[]): void {
    const ids = tokens ?? fight.order.map((e) => e.token).filter((id) => !isLairTurn(id));
    const fighters = ids.map((id) => this.table.fighter(this.inOrder(fight, id)));
    const after = rerollInitiative(
      fight,
      fighters.map((f) => ({
        token: f.token.id,
        bonus: f.sheet.initiative,
        speed: f.sheet.speed,
        ...pickedEdge(this.table.picks.take(f.token.id)),
      })),
      this.table.rng,
    );
    this.table.store.setCombat(after);
    const rolled = after.order.filter((e) => ids.includes(e.token));
    const names = rolled.map((e) => `${this.table.store.tokens.get(e.token)?.name ?? e.token} ${e.initiative}`);
    this.table.note(`The GM rerolls initiative: ${names.join(', ')}`);
  }

  private inOrder(fight: Combat, token: string): string {
    if (!fight.order.some((e) => e.token === token)) throw new Refusal('That creature is not in the fight');
    return token;
  }

  /** The turn as the GM set it starts: effects tick, and the log says whose it is. */
  private give(after: Combat): void {
    this.table.store.setCombat(after);
    const id = after.order[after.turn]!.token;
    const name = isLairTurn(id) ? 'the lair' : (this.table.store.tokens.get(id)?.name ?? id);
    this.table.note(`The GM makes it ${name}'s turn (round ${after.round})`);
    this.combat.begin();
  }

  private round(fight: Combat, value: number): void {
    if (value === fight.round) return;
    this.table.store.setCombat(setRound(fight, value));
    this.table.note(`The GM sets the round to ${value}`);
  }
}
