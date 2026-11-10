import { canControl, canOverride, type Player } from '@vtt/shared';
import { addToCombat, type Condition, leaveCombat, setInitiative, type Token } from '@vtt/system-dnd5e';
import type { CombatActions } from './combat-actions.ts';
import { Refusal, requireGm, type Table } from '../play/table.ts';

// What the token HUD does beyond editing fields (that is `editToken`):
// putting a condition on a creature or taking it off, and the GM adding a
// creature to the fight or taking it out; and the GM, or a trusted player on
// a creature they control, setting its initiative or overriding its turn.

/** A turn set by hand: what it has left (true: has it), each left out stays as it is. */
export interface TurnOverride {
  action?: boolean;
  bonus?: boolean;
  reaction?: boolean;
  move?: number;
}

export type HudMessage =
  | { t: 'condition'; token: string; condition: Condition; on: boolean }
  | { t: 'combatant'; token: string; on: boolean }
  | { t: 'initiative'; token: string; value: number }
  | ({ t: 'turnOverride'; token: string } & TurnOverride);

const label = (c: Condition) => c[0]!.toUpperCase() + c.slice(1);

export class HudActions {
  constructor(
    private table: Table,
    private combat: CombatActions,
  ) {}

  handle(player: Player, canSee: (id: string) => boolean, msg: HudMessage): void {
    if (!canSee(msg.token)) throw new Refusal('No such token');
    if (msg.t === 'condition') this.condition(player, msg.token, msg.condition, msg.on);
    else if (msg.t === 'combatant') this.combatant(player, msg.token, msg.on);
    else if (msg.t === 'initiative') this.initiative(player, msg.token, msg.value);
    else this.override(player, msg.token, msg);
  }

  /** On: the creature has the condition (once); off: whatever gave it ends. */
  private condition(player: Player, id: string, condition: Condition, on: boolean): void {
    const token = this.table.fighter(id).token;
    if (!canControl(token, player)) throw new Refusal(`You don't control ${token.name}`);
    const effects = token.effects ?? [];
    const has = effects.some((e) => e.conditions?.includes(condition));
    if (on === has) return;
    const next = on
      ? [...effects, { id: `condition-${condition}`, name: label(condition), conditions: [condition] }]
      : effects.filter((e) => !e.conditions?.includes(condition));
    this.table.store.setToken({ ...token, effects: next.length ? next : undefined });
  }

  /** GM: into the fight (starting one if none is on) with rolled initiative, or out of it. */
  private combatant(player: Player, id: string, on: boolean): void {
    requireGm(player);
    const store = this.table.store;
    const fight = store.combat;
    if (!on) {
      if (!fight) return;
      const after = leaveCombat(fight, id, this.table.turnInfo);
      return store.setCombat(after.order.length ? after : undefined);
    }
    if (!fight) return this.combat.start(player, [id]);
    const { sheet } = this.table.fighter(id);
    store.setCombat(addToCombat(fight, { token: id, bonus: sheet.initiative, speed: sheet.speed }, this.table.rng));
  }

  /** A creature's initiative set by hand (a mistyped roll, a held turn). */
  private initiative(player: Player, id: string, value: number): void {
    this.overridable(player, id);
    const fight = this.table.store.combat;
    if (!fight?.order.some((e) => e.token === id)) throw new Refusal('That creature is not in the fight');
    this.table.store.setCombat(setInitiative(fight, id, value));
  }

  /** The creature, if `player` may bend the rules of its turns (canOverride). */
  private overridable(player: Player, id: string): Token {
    const token = this.table.store.tokens.get(id);
    if (!token) throw new Refusal('No such token');
    if (!canOverride(token, player))
      throw new Refusal(`Only the GM or a trusted player can override ${token.name}'s turn`);
    return token;
  }

  /** What a creature has left this turn, set by hand; the action and movement only on its turn, the reaction any time. */
  private override(player: Player, id: string, set: TurnOverride): void {
    const token = this.overridable(player, id);
    if (!this.table.inFight(id) && !this.table.budget(token)) throw new Refusal(`${token.name} is not in the fight`);
    const turn = set.action !== undefined || set.bonus !== undefined || set.move !== undefined;
    if (turn) this.setTurn(token, set);
    if (set.reaction !== undefined) this.setReaction(id, set.reaction);
    this.table.note(`Override: ${token.name} ${overrideText(set)} (${player.name})`);
  }

  private setTurn(token: Token, { action, bonus, move }: TurnOverride): void {
    const left = this.table.budget(token);
    if (!left) throw new Refusal(`${token.name} is not in the fight`);
    const attacks = action === undefined ? left.attacks : 0;
    this.table.setBudget(token, {
      ...left,
      action: action ?? left.action,
      bonus: bonus ?? left.bonus,
      move: move ?? left.move,
      attacks,
    });
  }

  private setReaction(id: string, has: boolean): void {
    const fight = this.table.store.combat!;
    const reacted = fight.reacted.filter((r) => r !== id);
    this.table.store.setCombat({ ...fight, reacted: has ? reacted : [...reacted, id] });
  }
}

const NAMES: Record<'action' | 'bonus' | 'reaction', string> = {
  action: 'action',
  bonus: 'bonus action',
  reaction: 'reaction',
};

/** "has an action, no reaction and 30 ft of movement left". */
function overrideText(set: TurnOverride): string {
  const parts = (['action', 'bonus', 'reaction'] as const)
    .filter((k) => set[k] !== undefined)
    .map((k) => `${set[k] ? 'a' : 'no'} ${NAMES[k]}`.replace(/^a a/, 'an a'));
  if (set.move !== undefined) parts.push(`${set.move} ft of movement`);
  return `has ${parts.join(', ') || 'nothing changed'} left`;
}
