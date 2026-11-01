import {
  applyDamage,
  attackRange,
  canControl,
  isParty,
  currentTurn,
  deathSave,
  isDying,
  lightAttack,
  offHandCost,
  offHandProblem,
  endOfTurnSaves,
  leaveCombat,
  nextTurn,
  resolveWeaponAttack,
  smiteProblem,
  startCombat,
  tickEffects,
  tokenDistance,
  type Attack,
  type AttackLog,
  type Player,
  type Token,
  type WeaponAttackOutcome,
} from '@vtt/shared';
import { Refusal, requireGm, type Cost, type Fighter, type Table } from './table.ts';

/** An attack that has been rolled but not yet landed: its target may still react (shield). */
export interface PendingHit {
  attacker: Fighter;
  target: Fighter;
  attack: Attack;
  range: 'normal' | 'long';
  smite?: number;
  outcome: WeaponAttackOutcome;
}

export interface AttackRequest {
  attacker: string;
  target: string;
  attack: string;
  smite?: number;
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
    private turnStarted: (id: string) => void = () => undefined,
    /** Offers the target a reaction to a hit; true when the attack waits for the answer. */
    private onHit: (hit: PendingHit) => boolean = () => false,
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
    const first = currentTurn(combat);
    if (first) this.startOfTurn(first);
  }

  end(player: Player): void {
    requireGm(player);
    this.store.setCombat(undefined);
  }

  endTurn(player: Player): void {
    const combat = this.store.combat;
    if (!combat) throw new Refusal('There is no fight going on');
    const token = this.store.tokens.get(currentTurn(combat) ?? '');
    if (token && !canControl(token, player)) throw new Refusal("It's not your turn");
    if (token) this.endOfTurn(token);
    this.advance();
  }

  /** Passes the turn on; a dying character's turn is only its death save, so it passes again. */
  private advance(): void {
    for (let guard = 0; guard < 100; guard++) {
      const next = nextTurn(this.store.combat!, this.table.turnInfo);
      this.store.setCombat(next);
      const starting = currentTurn(next);
      if (!starting) return;
      this.startOfTurn(starting);
      if (!this.deathSaveFor(starting)) return;
    }
  }

  /** Rolls a dying character's death save; true when its turn is over (it didn't wake). */
  private deathSaveFor(id: string): boolean {
    const token = this.store.tokens.get(id);
    if (token?.deathSaves && (token.hp ?? 1) > 0) this.store.setToken({ ...token, deathSaves: undefined });
    if (!token || !isDying(token)) return false;
    const { token: after, note } = deathSave(token, this.table.rng);
    this.store.setToken(after);
    this.table.note(note);
    return isDying(after) || (after.hp ?? 1) <= 0;
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
    this.hearten(id);
    this.turnStarted(id);
  }

  /** What effects give at the start of the bearer's turn: temporary hit points (heroism), attacks (haste). */
  private hearten(id: string): void {
    const token = this.store.tokens.get(id);
    if (!token) return;
    const effects = token.effects ?? [];
    const given = Math.max(0, ...effects.map((e) => (typeof e.turnTempHp === 'number' ? e.turnTempHp : 0)));
    if (given > (token.tempHp ?? 0)) this.store.setToken({ ...token, tempHp: given });
    const attacks = effects.reduce((n, e) => n + (e.turnAttacks ?? 0), 0);
    const left = attacks ? this.table.budget(token) : undefined;
    if (left) this.table.setBudget(token, { ...left, attacks: left.attacks + attacks });
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
    const attack = this.attackOf(attacker, req);
    const cost = this.attackCost(attacker, attack);
    this.table.check(attacker.token, cost);
    const feet = tokenDistance(attacker.token, target.token, this.store.world.gridSize);
    const range = attackRange(attack, feet);
    if (range === 'out') throw new Refusal(`${target.token.name} is out of range (${feet} ft)`);
    if (!this.table.clearShot([attacker.token.x, attacker.token.y], [target.token.x, target.token.y])) {
      throw new Refusal(`${attacker.token.name} has no clear shot`);
    }
    this.table.pay(attacker.token, cost, attacker.sheet.attacksPerAction);
    if (lightAttack(attack)) this.markUsed(attacker.token, 'light-attack');
    if (attack.offHand && cost === 'free') this.markUsed(attacker.token, 'nick');
    this.resolve({ attacker, target, attack, range }, { smite: req.smite, reaction: false });
  }

  /** An opportunity attack: the reaction the creature had, not its action, and the target was in reach as it left. */
  reactionAttack(player: Player, req: AttackRequest): void {
    const attacker = this.table.actor(player, req.attacker);
    const target = this.table.fighter(req.target);
    const attack = this.attackOf(attacker, req);
    this.table.check(attacker.token, 'reaction');
    this.table.pay(attacker.token, 'reaction');
    this.resolve({ attacker, target, attack, range: 'normal' }, { smite: req.smite, reaction: true });
  }

  /** An Attack action attack, or two-weapon fighting's off-hand attack: a bonus action, free with nick. */
  private attackCost(attacker: Fighter, attack: Attack): Cost {
    if (!attack.offHand) return 'attack';
    const used = this.table.budget(attacker.token)?.used;
    if (!used) return 'free';
    const problem = offHandProblem(used);
    if (problem) throw new Refusal(`${attacker.token.name} ${problem}`);
    return offHandCost(attacker.sheet, attack, used);
  }

  private attackOf(attacker: Fighter, req: AttackRequest): Fighter['sheet']['attacks'][number] {
    const attack = attacker.sheet.attacks.find((a) => a.name === req.attack);
    if (!attack) throw new Refusal(`${attacker.token.name} has no attack called ${req.attack}`);
    const smiting = req.smite && smiteProblem(attacker.sheet, attack, req.smite);
    if (smiting) throw new Refusal(`${attacker.token.name} ${smiting}`);
    return attack;
  }

  private resolve(
    { attacker, target, attack, range }: Pick<PendingHit, 'attacker' | 'target' | 'attack' | 'range'>,
    { smite, reaction }: { smite: number | undefined; reaction: boolean },
  ): void {
    // Out of its turn a creature has no budget; its sneak attack is still unused.
    const sneakUsed = !reaction && !!this.table.budget(attacker.token)?.used.includes('sneak-attack');
    const outcome = resolveWeaponAttack(
      {
        attacker,
        target,
        attack,
        range,
        gridSize: this.store.world.gridSize,
        allyNearTarget: this.allyNear(attacker.token, target.token),
        sneakUsed,
        smite,
      },
      this.table.rng,
    );
    if (outcome.sneak && !reaction) this.markUsed(attacker.token, 'sneak-attack');
    const hit = { attacker, target, attack, range, smite, outcome };
    if (!outcome.roll.hit || !this.onHit(hit)) this.land(hit);
  }

  /** Lands a rolled attack, once any reaction to it is settled. */
  land({ attacker, target, attack, range, smite, outcome }: PendingHit): void {
    if (outcome.smote) this.table.spendSlot(attacker.token.id, smite!);
    this.table.useUp(outcome.used);
    this.applyOutcome(attacker, target, outcome, { range, name: attack.name, kind: attack.kind });
  }

  private markUsed(token: Token, what: string): void {
    const left = this.table.budget(token);
    if (left) this.table.setBudget(token, { ...left, used: [...left.used, what] });
  }

  /** Another creature on the attacker's side stands within 5 ft of the target. */
  private allyNear(attacker: Token, target: Token): boolean {
    const side = (t: Token) => isParty(t);
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
    { range, name, kind }: { range: string; name: string; kind: AttackLog['kind'] },
  ): void {
    const { roll: result } = outcome;
    const parts = result.damage.map((d) => ({ amount: d.roll.total, type: d.type }));
    if (outcome.graze) parts.push(outcome.graze);
    const fresh = this.table.fighter(target.token.id);
    const { dealt, hp, tempHp } = applyDamage(fresh.sheet, parts);
    const total = dealt.reduce((sum, d) => sum + d, 0);
    if (total > 0) this.table.hurt(fresh.token, { hp, tempHp, crit: result.crit }, total);
    this.addEffects(target.token.id, outcome);
    const notes = [...outcome.notes];
    if (range === 'long') notes.push('long range: disadvantage');
    if (outcome.graze) notes.push(`graze: ${dealt.at(-1)} damage`);
    if (total > 0 && hp <= 0) notes.push(`${target.token.name} is down`);
    notes.push(...this.push(attacker.token, target.token, outcome.push));
    this.logAttack({
      attacker: attacker.token.name,
      target: target.token.name,
      attackerId: attacker.token.id,
      targetId: target.token.id,
      kind,
      attack: name,
      d20: result.d20,
      hit: result.hit,
      crit: result.crit,
      damage: total,
      parts: result.damage.map((d, i) => ({ ...d, dealt: dealt[i]! })),
      notes,
    });
  }

  /** The push mastery shoves the target straight away from the attacker. */
  private push(attacker: Token, target: Token, feet: number | undefined): string[] {
    if (!feet) return [];
    const moved = this.table.forceMove(target.id, [attacker.x, attacker.y], feet);
    return moved > 0 ? [`${target.name} is pushed ${moved} ft`] : [];
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
    if (!token || !canControl(token, player)) throw new Refusal('No such token');
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
