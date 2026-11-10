import {
  applyDamage,
  turnStartHarm,
  type Attack,
  type AttackLog,
  attackRange,
  actsNow,
  type Combat,
  currentTurn,
  deathSave,
  endTurns,
  firstTurn,
  endOfTurnSaves,
  isDying,
  isLairTurn,
  refreshLegendary,
  withLair,
  leaveCombat,
  lightAttack,
  nextTurn,
  takers,
  offHandCost,
  offHandProblem,
  resolveWeaponAttack,
  type CritChoice,
  pickNotes,
  type RollChoice,
  type RollEdge,
  smiteProblem,
  startCombat,
  tickEffects,
  freshWards,
  blinkAway,
  type Token,
  tokenDistance,
  type WeaponAttackOutcome,
} from '@vtt/system-dnd5e';
import { canControl, gridKind, isParty, type Player, type Point } from '@vtt/shared';
import { attackGround } from './ground-attack.ts';
import { applyOutcome } from './attack-outcome.ts';
import { afterAttack, readiedFinisher, rollInitiative, turnEnds } from '../play/momentum-keeper.ts';
import { compelled, riseInAura } from '../play/turn-start.ts';
import { anotherTurn, breakTimeStop } from '../play/time-stop.ts';
import { legendaryAction, type TurnMessage } from './legendary-actions.ts';
import { breakSanctuary, loseImage, passSanctuary } from '../play/spell-wards.ts';
import { recharge } from '../play/recharge.ts';
import { type Surprise, surprisedTurn, surpriseOf, withSurprise } from '../play/surprise.ts';
import { Refusal, requireGm, type Cost, type Fighter, type Table } from '../play/table.ts';

/** An attack that has been rolled but not yet landed: its target may still react (shield). */
export interface PendingHit {
  attacker: Fighter;
  target: Fighter;
  attack: Attack;
  range: 'normal' | 'long';
  smite?: number;
  /** The hit finisher readied with it (finishers.ts). */
  finisher?: string;
  outcome: WeaponAttackOutcome;
}

export interface AttackRequest {
  attacker: string;
  target: string;
  attack: string;
  smite?: number;
  finisher?: string;
  /** The attacker's own advantage or disadvantage, and a critical forced or held back. */
  edge?: RollEdge;
  crit?: CritChoice;
}

/** An attack as a player asks for it: at a creature, or at empty ground (`point`). */
/** Turn-based mode on or off, and who takes turns. */
export interface TurnBasedAsk {
  on: boolean;
  tokens?: readonly string[];
  shared?: boolean;
}

/** How an attack is resolved: its smite and finisher, out of turn as a reaction, and the attacker's pick. */
/** How the GM starts a fight: BG3-style shared turns, and who is surprised. */
interface StartAsk {
  shared?: boolean;
  surprised?: readonly string[];
}

interface Resolving {
  smite: number | undefined;
  finisher?: string;
  reaction: boolean;
  pick?: RollChoice;
}

export type AttackAsked = Omit<AttackRequest, 'target'> & { target?: string; point?: Point };

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

  /** GM: a fight; `shared`: party members next to each other share a turn (BG3). */
  start(player: Player, ids: readonly string[], { shared = false, surprised }: StartAsk = {}): void {
    requireGm(player);
    const fighters = ids.map((id) => this.table.fighter(id));
    this.open(fighters, 'Roll for initiative!', { peaceful: false, shared, surprise: surpriseOf(fighters, surprised) });
  }

  /** Rolls initiative for `fighters` and starts the first turn. */
  private open(
    fighters: Fighter[],
    heading: string,
    { peaceful, shared, surprise }: { peaceful: boolean; shared: boolean; surprise?: Surprise },
  ): void {
    const rolled = startCombat(
      fighters.map((f) => ({
        token: f.token.id,
        bonus: f.sheet.initiative,
        speed: f.sheet.speed,
        disadvantage: surprise?.slow.has(f.token.id),
      })),
      this.table.rng,
    );
    rollInitiative(this.table, fighters);
    const lairs = peaceful ? [] : fighters.filter((f) => f.sheet.lair).map((f) => f.token.id);
    const opened = surprise ? withSurprise(rolled, surprise) : rolled;
    const fight = peaceful ? { ...opened, peaceful } : withLair(opened, lairs);
    const combat = shared ? firstTurn({ ...fight, shared }, this.table.turnInfo) : fight;
    this.store.setCombat(combat);
    const names = new Map(fighters.map((f) => [f.token.id, f.token.name]));
    const order = combat.order.map((e) => `${names.get(e.token) ?? 'Lair'} ${e.initiative}`).join(', ');
    this.table.note(`${heading} ${order}`);
    for (const id of takers(combat)) this.startOfTurn(id);
  }

  end(player: Player): void {
    requireGm(player);
    this.store.setCombat(undefined);
  }

  /** GM: turn-based mode outside a fight. The creatures picked (else the party on the scene) take turns, as in a fight but with no one fighting. */
  turnBased(player: Player, { on, tokens, shared }: TurnBasedAsk): void {
    requireGm(player);
    const combat = this.store.combat;
    if (combat && !combat.peaceful) {
      throw new Refusal(on ? 'A fight is on: it is turn-based already' : 'End the fight to leave turn-based mode');
    }
    if (!on) return this.store.setCombat(undefined);
    if (combat) return;
    const fighters = tokens?.length ? tokens.map((id) => this.table.fighter(id)) : this.partyHere();
    if (!fighters.length) throw new Refusal('There is no one in the party here to take turns');
    this.open(fighters, 'Turn-based mode:', { peaceful: true, shared: shared === true });
  }

  /** The party members on the scene still standing. */
  private partyHere(): Fighter[] {
    const party = [...this.store.tokens.values()].filter((t) => isParty(t) && !t.leader);
    return party.flatMap((t) => {
      const sheet = this.table.sheetOf(t);
      return sheet && sheet.hp > 0 ? [{ token: t, sheet }] : [];
    });
  }

  /** Ends one creature's turn: `token`, else the first of yours taking it. A shared turn passes on once all have ended theirs. */
  endTurn(player: Player, token?: string): void {
    const combat = this.store.combat;
    if (!combat) throw new Refusal('There is no fight going on');
    if (isLairTurn(currentTurn(combat))) requireGm(player);
    const acting = takers(combat).flatMap((id) => this.store.tokens.get(id) ?? []);
    const mine = acting.filter((t) => actsNow(combat, t.id) && canControl(t, player));
    const ending = token ? mine.filter((t) => t.id === token) : mine.slice(0, 1);
    if ((acting.length || token) && !ending.length) throw new Refusal("It's not your turn");
    for (const t of ending) this.endOfTurn(t);
    const after = endTurns(
      this.store.combat!,
      ending.map((t) => t.id),
      this.table.turnInfo,
    );
    if (after.turn === combat.turn && after.round === combat.round) this.store.setCombat(after);
    else if (!anotherTurn(this.table, currentTurn(combat))) this.advance();
  }

  /** Passes the turn on; a dying character's turn is only its death save, so it passes again. */
  private advance(): void {
    for (let guard = 0; guard < 100; guard++) {
      const next = nextTurn(this.store.combat!, this.table.turnInfo);
      this.store.setCombat(next);
      if (!currentTurn(next) || !this.beginTurn(next)) return;
    }
  }

  /** Starts the turn of everyone taking it; true when it is over already (all of them dying). */
  private beginTurn(combat: Combat): boolean {
    const all = takers(combat);
    for (const id of all) this.startOfTurn(id);
    const over = all.filter((id) => this.deathSaveFor(id));
    if (over.length === all.length) return true;
    if (over.length) this.store.setCombat(endTurns(this.store.combat!, over, this.table.turnInfo));
    return false;
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
    const blinked = blinkAway(after, this.table.rng);
    if (blinked !== after) this.table.note(`${token.name} blinks into the Ethereal Plane`);
    if (blinked !== token) this.store.setToken(blinked);
    turnEnds(this.table, token.id);
  }

  /** Effects made by the creature whose turn starts count down a round. */
  private startOfTurn(id: string): void {
    const own = this.store.tokens.get(id);
    if (own && refreshLegendary(own) !== own) this.store.setToken(refreshLegendary(own));
    for (const t of [...this.store.tokens.values()]) {
      const after = freshWards(tickEffects(t, id));
      if (after !== t) this.store.setToken(after);
    }
    this.hearten(id);
    recharge(this.table, id);
    this.smoulder(id);
    surprisedTurn(this.table, id);
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

  /** Lasting damage (searing smite) and regeneration as the bearer's turn starts. */
  private smoulder(id: string): void {
    const token = this.store.tokens.get(id);
    const sheet = token && this.table.sheetOf(token);
    if (!token || !sheet) return;
    const { parts, heal } = turnStartHarm(sheet.effects, this.table.rng);
    if (parts.length) {
      const { dealt, hp, tempHp, warded } = applyDamage(sheet, parts, this.table.rng);
      const total = dealt.reduce((n, d) => n + d, 0);
      this.table.note(`${token.name} takes ${total} damage from lasting effects`);
      if (total > 0) this.table.hurt(token, { hp, tempHp, warded }, total);
    }
    riseInAura(this.table, id);
    compelled(this.table, id);
    const now = this.store.tokens.get(id)!;
    const sheetNow = this.table.sheetOf(now)!;
    if (heal && sheetNow.hp > 0 && sheetNow.hp < sheetNow.maxHp) {
      const hp = Math.min(sheetNow.maxHp, sheetNow.hp + heal);
      this.store.setToken({ ...now, hp: hp >= sheetNow.maxHp ? undefined : hp });
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

  attack(player: Player, canSee: (id: string) => boolean, asked: AttackAsked): void {
    if (!asked.target) return this.atGround(player, asked);
    const req = { ...asked, target: asked.target };
    const attacker = this.table.actor(player, req.attacker);
    if (!canSee(req.target)) throw new Refusal('No such target');
    const target = this.table.fighter(req.target);
    const attack = this.attackOf(attacker, req);
    const cost = this.attackCost(attacker, attack);
    this.table.check(attacker.token, cost);
    const feet = this.distance(attacker.token, target.token);
    const range = attackRange(attack, feet);
    if (range === 'out') throw new Refusal(`${target.token.name} is out of range (${feet} ft)`);
    if (!this.table.clearShot([attacker.token.x, attacker.token.y], [target.token.x, target.token.y])) {
      throw new Refusal(`${attacker.token.name} has no clear shot`);
    }
    passSanctuary(this.table, attacker, target);
    this.table.pay(attacker.token, cost, attacker.sheet.attacksPerAction);
    if (lightAttack(attack)) this.markUsed(attacker.token, 'light-attack');
    if (attack.offHand && cost === 'free') this.markUsed(attacker.token, 'nick');
    const pick = { edge: req.edge, crit: req.crit };
    this.resolve(
      { attacker, target, attack, range },
      { smite: req.smite, finisher: req.finisher, reaction: false, pick },
    );
  }

  /** An attack at empty ground: it costs what an attack costs and hits nothing. */
  private atGround(player: Player, req: AttackAsked): void {
    const attacker = this.table.actor(player, req.attacker);
    const attack = this.attackOf(attacker, req);
    if (!req.point) throw new Refusal(`Pick a target for ${attack.name}`);
    const cost = this.attackCost(attacker, attack);
    this.table.check(attacker.token, cost);
    attackGround(this.table, { attacker, attack, point: req.point, cost }, this.logAttack);
  }

  /** Turn-based mode on or off, or the GM's legendary action (its attack made out of turn) or lair action. */
  turnAction(player: Player, canSee: (id: string) => boolean, msg: TurnMessage): void {
    if (msg.t === 'turnBased') return this.turnBased(player, msg);
    legendaryAction(this.table, player, msg, (attacker, targetId, name) => {
      if (!canSee(targetId)) throw new Refusal('No such target');
      const target = this.table.fighter(targetId);
      const attack = this.attackOf(attacker, { attacker: attacker.token.id, target: targetId, attack: name });
      const range = attackRange(attack, this.distance(attacker.token, target.token));
      if (range === 'out') throw new Refusal(`${target.token.name} is out of range`);
      this.resolve({ attacker, target, attack, range }, { smite: undefined, reaction: true });
    });
  }

  /** An opportunity attack: the reaction the creature had, not its action, and the target was in reach as it left. */
  reactionAttack(player: Player, req: AttackRequest): void {
    const attacker = this.table.actor(player, req.attacker);
    const target = this.table.fighter(req.target);
    const attack = this.attackOf(attacker, req);
    this.table.check(attacker.token, 'reaction');
    passSanctuary(this.table, attacker, target);
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

  private attackOf(attacker: Fighter, req: AttackAsked): Fighter['sheet']['attacks'][number] {
    const attack = attacker.sheet.attacks.find((a) => a.name === req.attack);
    if (!attack) throw new Refusal(`${attacker.token.name} has no attack called ${req.attack}`);
    const smiting = req.smite && smiteProblem(attacker.sheet, attack, req.smite);
    if (smiting) throw new Refusal(`${attacker.token.name} ${smiting}`);
    return attack;
  }

  private resolve(
    { attacker, target, attack, range }: Pick<PendingHit, 'attacker' | 'target' | 'attack' | 'range'>,
    { smite, finisher, reaction, pick }: Resolving,
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
        grid: gridKind(this.store.world),
        allyNearTarget: this.allyNear(attacker.token, target.token),
        sneakUsed,
        smite,
        finisher: readiedFinisher(attacker, attack, finisher),
        pick,
      },
      this.table.rng,
    );
    outcome.notes.push(...pickNotes(pick));
    if (outcome.sneak && !reaction) this.markUsed(attacker.token, 'sneak-attack');
    breakSanctuary(this.table, attacker.token.id);
    const hit = { attacker, target, attack, range, smite, finisher, outcome };
    if (!outcome.roll.hit || !this.onHit(hit)) this.land(hit);
  }

  /** Lands a rolled attack, once any reaction to it is settled. */
  land({ attacker, target, attack, range, smite, finisher, outcome }: PendingHit): void {
    if (outcome.smote) this.table.spendSlot(attacker.token.id, smite!);
    if (outcome.decoy === 'hit') loseImage(this.table, target.token.id);
    this.table.useUp(outcome.used);
    breakTimeStop(this.table, attacker.token.id, [target.token.id]);
    applyOutcome(
      this.table,
      this.logAttack,
      { attacker, target, outcome },
      { range, name: attack.name, kind: attack.kind },
    );
    const onTurn = !!this.store.combat && actsNow(this.store.combat, attacker.token.id);
    afterAttack(this.table, { attacker, target, outcome, finisher, onTurn });
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
        this.distance(t, target) <= 5,
    );
  }

  /** Feet between two creatures, as the scene measures them. */
  private distance(a: Token, b: Token): number {
    const { world } = this.store;
    return tokenDistance(a, b, world.gridSize, gridKind(world));
  }

  /** A token disappeared from the world: take it out of the fight. */
  forget(id: string): void {
    const combat = this.store.combat;
    if (!combat || !this.table.inFight(id)) return;
    const after = leaveCombat(combat, id, this.table.turnInfo);
    this.store.setCombat(after.order.length ? after : undefined);
  }
}
