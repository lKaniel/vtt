import {
  applyDamage,
  attackRange,
  canControlToken,
  currentTurn,
  endOfTurnSaves,
  leaveCombat,
  nextTurn,
  resolveWeaponAttack,
  startCombat,
  tickEffects,
  tokenDistance,
  type AttackLog,
  type Player,
  type Token,
  type WeaponAttackOutcome,
} from '@vtt/shared';
import { Refusal, requireGm, type Fighter, type Table } from './table.ts';

export interface AttackRequest {
  attacker: string;
  target: string;
  attack: string;
}

/**
 * Combat rules on top of the world: starting fights, turns, movement
 * budgets, attacks and equipment. Each method either applies the change to
 * the store or throws a Refusal.
 */
export class CombatActions {
  constructor(
    private table: Table,
    private logAttack: (log: AttackLog) => void,
  ) {}

  private get store() {
    return this.table.store;
  }

  start(player: Player, ids: readonly string[]): void {
    requireGm(player);
    const fighters = ids.map((id) => this.table.fighter(id));
    const combat = startCombat(
      fighters.map((f) => ({ token: f.token.id, bonus: f.sheet.initiative, speed: f.sheet.speed })),
      this.table.rng,
    );
    this.store.setCombat(combat);
    const names = new Map(fighters.map((f) => [f.token.id, f.token.name]));
    const order = combat.order.map((e) => `${names.get(e.token)} ${e.initiative}`).join(', ');
    this.table.note(`Roll for initiative! ${order}`);
  }

  end(player: Player): void {
    requireGm(player);
    this.store.setCombat(undefined);
  }

  endTurn(player: Player): void {
    const combat = this.store.combat;
    if (!combat) throw new Refusal('There is no fight going on');
    const token = this.store.tokens.get(currentTurn(combat) ?? '');
    if (token && !canControlToken(token, player)) throw new Refusal("It's not your turn");
    if (token) this.endOfTurn(token);
    const next = nextTurn(this.store.combat ?? combat, this.table.turnInfo);
    this.store.setCombat(next);
    const starting = currentTurn(next);
    if (starting) this.startOfTurn(starting);
  }

  /** Effects like hold person get another save as the creature's turn ends. */
  private endOfTurn(token: Token): void {
    const sheet = this.table.sheetOf(token);
    if (!sheet) return;
    const { token: after, saves } = endOfTurnSaves(token, sheet, this.table.rng);
    for (const { effect, save } of saves) {
      const result = save.success ? 'shakes it off' : 'is still affected';
      this.table.note(`${token.name} saves against ${effect}: ${save.total} vs DC ${save.dc}, ${result}`);
    }
    if (after !== token) this.store.setToken(after);
  }

  /** Effects made by the creature whose turn starts count down a round. */
  private startOfTurn(id: string): void {
    for (const t of [...this.store.tokens.values()]) {
      const after = tickEffects(t, id);
      if (after !== t) this.store.setToken(after);
    }
  }

  /** Checks that `token` may walk `feet` now, and spends the movement in a fight. Standing up costs half its speed. */
  move(token: Token, feet: number): Token {
    const sheet = this.table.sheetOf(token);
    const prone = token.effects?.filter((e) => e.conditions?.includes('prone')) ?? [];
    const standing = prone.length && sheet ? Math.ceil(sheet.speed / 2) : 0;
    const stood = prone.length ? { ...token, effects: token.effects!.filter((e) => !prone.includes(e)) } : token;
    const left = this.table.budget(token);
    if (!left) return stood;
    if (feet + standing > left.move) {
      throw new Refusal(`${token.name} has only ${left.move - standing} ft of movement left`);
    }
    this.table.setBudget(token, { ...left, move: left.move - feet - standing });
    return stood;
  }

  attack(player: Player, canSee: (id: string) => boolean, req: AttackRequest): void {
    const attacker = this.table.actor(player, req.attacker);
    if (!canSee(req.target)) throw new Refusal('No such target');
    const target = this.table.fighter(req.target);
    const attack = attacker.sheet.attacks.find((a) => a.name === req.attack);
    if (!attack) throw new Refusal(`${attacker.token.name} has no attack called ${req.attack}`);
    this.table.check(attacker.token, 'attack');
    const feet = tokenDistance(attacker.token, target.token, this.store.world.gridSize);
    const range = attackRange(attack, feet);
    if (range === 'out') throw new Refusal(`${target.token.name} is out of range (${feet} ft)`);
    if (!this.table.clearShot([attacker.token.x, attacker.token.y], [target.token.x, target.token.y])) {
      throw new Refusal(`${attacker.token.name} has no clear shot`);
    }
    const sneakUsed = !!this.table.budget(attacker.token)?.used.includes('sneak-attack');
    const outcome = resolveWeaponAttack(
      {
        attacker,
        target,
        attack,
        range,
        gridSize: this.store.world.gridSize,
        allyNearTarget: this.allyNear(attacker.token, target.token),
        sneakUsed,
      },
      this.table.rng,
    );
    this.table.pay(attacker.token, 'attack', attacker.sheet.attacksPerAction);
    if (outcome.sneak) this.markUsed(attacker.token, 'sneak-attack');
    this.table.useUp(outcome.used);
    this.applyOutcome(attacker, target, outcome, { range, name: attack.name });
  }

  private markUsed(token: Token, what: string): void {
    const left = this.table.budget(token);
    if (left) this.table.setBudget(token, { ...left, used: [...left.used, what] });
  }

  /** Another creature on the attacker's side stands within 5 ft of the target. */
  private allyNear(attacker: Token, target: Token): boolean {
    const side = (t: Token) => t.controllers.length > 0;
    return [...this.store.tokens.values()].some(
      (t) =>
        t.id !== attacker.id &&
        t.id !== target.id &&
        side(t) === side(attacker) &&
        (this.table.sheetOf(t)?.hp ?? 0) > 0 &&
        tokenDistance(t, target, this.store.world.gridSize) <= 5,
    );
  }

  private applyOutcome(
    attacker: Fighter,
    target: Fighter,
    outcome: WeaponAttackOutcome,
    { range, name }: { range: string; name: string },
  ): void {
    const { roll: result } = outcome;
    const parts = result.damage.map((d) => ({ amount: d.roll.total, type: d.type }));
    if (outcome.graze) parts.push(outcome.graze);
    const fresh = this.table.fighter(target.token.id);
    const { dealt, hp } = applyDamage(fresh.sheet, parts);
    const total = dealt.reduce((sum, d) => sum + d, 0);
    if (total > 0) this.table.hurt(fresh.token, hp, total);
    this.addEffects(target.token.id, outcome);
    const notes = [...outcome.notes];
    if (range === 'long') notes.push('long range: disadvantage');
    if (outcome.graze) notes.push(`graze: ${dealt.at(-1)} damage`);
    if (total > 0 && hp <= 0) notes.push(`${target.token.name} is down`);
    this.logAttack({
      attacker: attacker.token.name,
      target: target.token.name,
      attack: name,
      d20: result.d20,
      hit: result.hit,
      crit: result.crit,
      damage: total,
      parts: result.damage.map((d, i) => ({ ...d, dealt: dealt[i]! })),
      notes,
    });
  }

  private addEffects(id: string, outcome: WeaponAttackOutcome): void {
    if (!outcome.targetEffects.length) return;
    const token = this.store.tokens.get(id)!;
    const ids = new Set(outcome.targetEffects.map((e) => e.id));
    const effects = [...(token.effects ?? []).filter((e) => !ids.has(e.id)), ...outcome.targetEffects];
    this.store.setToken({ ...token, effects });
  }

  equip(player: Player, id: string, index: number, equipped: boolean): void {
    const token = this.store.tokens.get(id);
    if (!token || !canControlToken(token, player)) throw new Refusal('No such token');
    const inventory = token.inventory ?? [];
    if (!inventory[index]) throw new Refusal(`${token.name} has no such item`);
    this.store.setToken({ ...token, inventory: inventory.map((e, i) => (i === index ? { ...e, equipped } : e)) });
  }

  /** A token disappeared from the world: take it out of the fight. */
  forget(id: string): void {
    const combat = this.store.combat;
    if (!combat || !this.table.inFight(id)) return;
    const after = leaveCombat(combat, id, this.table.turnInfo);
    this.store.setCombat(after.order.length ? after : undefined);
  }
}
