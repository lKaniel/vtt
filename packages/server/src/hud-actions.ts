import { canControl, type Player } from '@vtt/shared';
import { addToCombat, type Condition, leaveCombat } from '@vtt/system-dnd5e';
import type { CombatActions } from './combat-actions.ts';
import { Refusal, requireGm, type Table } from './table.ts';

// What the token HUD does beyond editing fields (that is `editToken`):
// putting a condition on a creature or taking it off, and the GM adding a
// creature to the fight or taking it out.

export type HudMessage =
  { t: 'condition'; token: string; condition: Condition; on: boolean } | { t: 'combatant'; token: string; on: boolean };

export const isHudMessage = (msg: { t: string }): msg is HudMessage => msg.t === 'condition' || msg.t === 'combatant';

const label = (c: Condition) => c[0]!.toUpperCase() + c.slice(1);

export class HudActions {
  constructor(
    private table: Table,
    private combat: CombatActions,
  ) {}

  handle(player: Player, canSee: (id: string) => boolean, msg: HudMessage): void {
    if (!canSee(msg.token)) throw new Refusal('No such token');
    if (msg.t === 'condition') this.condition(player, msg.token, msg.condition, msg.on);
    else this.combatant(player, msg.token, msg.on);
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
}
