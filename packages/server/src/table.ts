import {
  afterDamage,
  canAct,
  type Combat,
  concentrationDc,
  type Content,
  type Creature,
  currentTurn,
  damagedWhileDown,
  dropConcentration,
  editionOf,
  forcedMove,
  freshTurn,
  isDead,
  isDying,
  leaveCombat,
  removeEffects,
  resolveCreature,
  rollSave,
  type Token,
  type TurnBudget,
  type TurnInfo,
  type UsedEffect,
  isLairTurn,
  lairOwner,
} from '@vtt/system-dnd5e';
import { canControl, hasLineOfSight, isGm, type Player, type Point, type Rng } from '@vtt/shared';
import type { GameStore } from './game-store.ts';
import { contentFor } from './game-packs.ts';

/** A request the rules don't allow; its message goes back to the player. */
export class Refusal extends Error {}

export interface Fighter {
  token: Token;
  sheet: Creature;
}

/** What one turn costs: an action, a bonus action, or one attack of an Attack action. */
export type Cost = 'action' | 'bonus' | 'attack' | 'reaction' | 'free';

/**
 * The world as the rules see it, shared by combat, spells and features:
 * creature sheets, whose turn it is and what's left of it, and the
 * consequences of getting hurt.
 */
export class Table {
  constructor(
    readonly store: GameStore,
    readonly rng: Rng,
    readonly note: (text: string) => void,
  ) {}

  content(token: Token): Content {
    return contentFor(this.store, token);
  }

  sheetOf(token: Token): Creature | undefined {
    return resolveCreature(token, this.content(token));
  }

  fighter(id: string): Fighter {
    const token = this.store.tokens.get(id);
    if (!token) throw new Refusal('No such token');
    const sheet = this.sheetOf(token);
    if (!sheet) throw new Refusal(`${token.name} has no stats`);
    return { token, sheet };
  }

  /** The creature, if `player` may act with it and it's able to. */
  actor(player: Player, id: string): Fighter {
    const f = this.fighter(id);
    if (!canControl(f.token, player)) throw new Refusal(`You don't control ${f.token.name}`);
    if (f.sheet.hp <= 0) throw new Refusal(`${f.token.name} is down`);
    if (!canAct(f.sheet)) throw new Refusal(`${f.token.name} can't act`);
    return f;
  }

  clearShot(from: Point, to: Point): boolean {
    return hasLineOfSight(from, to, this.store.wallsBetween(from, to), {
      kind: 'sight',
      gridSize: this.store.world.gridSize,
    });
  }

  inFight(id: string): boolean {
    return !!this.store.combat?.order.some((e) => e.token === id);
  }

  readonly turnInfo: TurnInfo = (id) => {
    if (isLairTurn(id)) return this.store.tokens.has(lairOwner(id)) ? { speed: 0, active: true } : undefined;
    const token = this.store.tokens.get(id);
    if (!token) return undefined;
    const sheet = this.sheetOf(token);
    return { speed: sheet?.speed ?? token.speed, active: !sheet || sheet.hp > 0 || isDying(token) };
  };

  // ---- Turn budgets -------------------------------------------------------

  /** Whose budget `token` spends: "left" on its own turn, else its id in `side` on its leader's turn. Throws when it's neither. */
  private budgetKey(combat: Combat, token: Token): string {
    const current = currentTurn(combat);
    if (current === token.id) return 'left';
    if (token.leader && token.leader === current) return token.id;
    throw new Refusal(`It's not ${token.name}'s turn`);
  }

  /** What `token` has left this turn, or undefined outside a fight. */
  budget(token: Token): TurnBudget | undefined {
    const combat = this.store.combat;
    if (!combat || !this.joins(combat, token)) return undefined;
    const key = this.budgetKey(combat, token);
    if (key === 'left') return combat.left;
    return combat.side[key] ?? freshTurn(this.turnInfo(token.id)?.speed ?? token.speed);
  }

  private joins(combat: Combat, token: Token): boolean {
    return this.inFight(token.id) || (!!token.leader && combat.order.some((e) => e.token === token.leader));
  }

  setBudget(token: Token, budget: TurnBudget): void {
    const combat = this.store.combat;
    if (!combat) return;
    const key = this.budgetKey(combat, token);
    if (key === 'left') this.store.setCombat({ ...combat, left: budget });
    else this.store.setCombat({ ...combat, side: { ...combat.side, [key]: budget } });
  }

  /** Throws unless `token` can pay `cost` now. Outside a fight everything is free. */
  check(token: Token, cost: Cost): void {
    if (cost === 'free') return;
    if (cost === 'reaction') return this.checkReaction(token);
    const left = this.budget(token);
    if (!left) return;
    if (cost === 'bonus' && !left.bonus) throw new Refusal(`${token.name} has already used their bonus action`);
    if (cost === 'action' && !left.action) throw new Refusal(`${token.name} has already used their action`);
    if (cost === 'attack' && !left.action && left.attacks === 0) {
      throw new Refusal(`${token.name} has already used their action`);
    }
  }

  /** Spends `cost`; an attack starts the Attack action, which gives `attacks` attacks. */
  pay(token: Token, cost: Cost, attacks = 1): void {
    if (cost === 'free') return;
    if (cost === 'reaction') return this.payReaction(token);
    const left = this.budget(token);
    if (!left) return;
    if (cost === 'bonus') return this.setBudget(token, { ...left, bonus: false });
    if (cost === 'action') return this.setBudget(token, { ...left, action: false, attacks: 0 });
    const next =
      left.attacks > 0 ? { ...left, attacks: left.attacks - 1 } : { ...left, action: false, attacks: attacks - 1 };
    this.setBudget(token, next);
  }

  /** A reaction is once per round, at any time, in a fight; outside one it's free. */
  private checkReaction(token: Token): void {
    if (this.store.combat?.reacted.includes(token.id)) {
      throw new Refusal(`${token.name} has already used their reaction`);
    }
  }

  private payReaction(token: Token): void {
    const combat = this.store.combat;
    if (combat && this.inFight(token.id)) this.store.setCombat({ ...combat, reacted: [...combat.reacted, token.id] });
  }

  /** Marks one spell slot of level `slot` as spent. */
  spendSlot(id: string, slot: number): void {
    const token = this.store.tokens.get(id);
    if (!token || slot < 1) return;
    const slots = [...(token.spent?.slots ?? [])];
    while (slots.length < slot) slots.push(0);
    slots[slot - 1]! += 1;
    this.store.setToken({ ...token, spent: { ...token.spent, slots } });
  }

  // ---- Consequences ------------------------------------------------------

  /** Ends effects that did their one job (guiding bolt's advantage, a vexing hit). */
  useUp(used: readonly UsedEffect[]): void {
    for (const id of new Set(used.map((u) => u.token))) {
      const token = this.store.tokens.get(id);
      const ids = new Set(used.filter((u) => u.token === id).map((u) => u.effect));
      if (token) this.store.setToken(removeEffects(token, ids));
    }
  }

  /**
   * Sets a creature's hit points (and temporary ones) after it took `damage`,
   * ends what damage ends, then checks its concentration.
   */
  hurt(token: Token, hit: { hp: number; tempHp?: number; crit?: boolean }, damage: number): void {
    const stored = this.store.tokens.get(token.id) ?? token;
    const before = this.sheetOf(stored)!;
    const { token: current, hit: after } = this.warded(stored, before.hp, hit);
    const hurt = this.downed(withHp(current, after, before.maxHp), {
      damage,
      crit: !!after.crit,
      maxHp: before.maxHp,
      hpBefore: before.hp,
    });
    const shaken = damage > 0 ? afterDamage(hurt, this.sheetOf(hurt)!, this.rng) : { token: hurt, notes: [] };
    this.store.setToken(shaken.token);
    for (const n of shaken.notes) this.note(n);
    this.checkConcentration(shaken.token, damage);
  }

  /** Death ward: dropping to 0 from above it leaves the creature at 1 instead, once. */
  private warded<T extends { hp: number }>(token: Token, hpBefore: number, hit: T): { token: Token; hit: T } {
    const ward = token.effects?.find((e) => e.deathWard);
    if (!ward || hit.hp > 0 || hpBefore <= 0) return { token, hit };
    this.note(`${token.name} is saved by ${ward.name}`);
    return { token: removeEffects(token, new Set([ward.id])), hit: { ...hit, hp: 1 } };
  }

  /** A character hit while down fails death saves, and massive damage kills it. */
  private downed(token: Token, hit: Parameters<typeof damagedWhileDown>[1]): Token {
    if ((token.hp ?? 1) > 0) return token;
    const after = damagedWhileDown(token, hit);
    if (isDead(after) && !isDead(token)) this.note(`${token.name} dies`);
    return after;
  }

  private checkConcentration(current: Token, damage: number): void {
    const hp = current.hp ?? 1;
    if (damage <= 0 || !current.concentration) return;
    const sheet = this.sheetOf(current)!;
    if (hp > 0) {
      const dc = concentrationDc(damage, editionOf(current, this.store.world));
      const save = rollSave(sheet, 'con', dc, this.rng);
      if (save.success) return this.note(`${current.name} keeps concentrating (${save.total} vs DC ${dc})`);
    }
    this.note(`${current.name} loses concentration on ${current.concentration.name}`);
    this.endConcentration(current.id);
  }

  /** Slides a creature up to `feet` away from `from` (negative: toward it), stopping at walls and creatures. Returns the feet it moved. */
  forceMove(id: string, from: Point, feet: number): number {
    const token = this.store.tokens.get(id);
    if (!token) return 0;
    const g = this.store.world.gridSize;
    const reach = (Math.abs(feet) / 5 + token.size) * g;
    const path = forcedMove({
      from,
      start: [token.x, token.y],
      feet,
      gridSize: g,
      walls: this.store.wallsBetween([token.x - reach, token.y - reach], [token.x + reach, token.y + reach]),
      taken: (p) => this.blocks(token, p),
    });
    if (path.length < 2) return 0;
    const [x, y] = path.at(-1)!;
    this.store.setToken({ ...token, x, y }, path);
    return (path.length - 1) * 5;
  }

  /** Whether a creature that isn't down stands where `token` would be at `p`. */
  private blocks(token: Token, [x, y]: Point): boolean {
    const g = this.store.world.gridSize;
    return [...this.store.tokens.values()].some((t) => {
      const reach = ((t.size + token.size) * g) / 2;
      const overlaps = Math.abs(t.x - x) < reach && Math.abs(t.y - y) < reach;
      return t.id !== token.id && overlaps && (this.sheetOf(t)?.hp ?? 1) > 0;
    });
  }

  /** Ends whatever `caster` concentrates on: its effects end and its summons vanish. */
  endConcentration(caster: string): void {
    const { changed, removed } = dropConcentration([...this.store.tokens.values()], caster);
    for (const t of changed) this.store.setToken(t);
    for (const id of removed) this.removeToken(id);
  }

  removeToken(id: string): void {
    const combat = this.store.combat;
    if (combat && this.inFight(id)) {
      const after = leaveCombat(combat, id, this.turnInfo);
      this.store.setCombat(after.order.length ? after : undefined);
    }
    this.store.removeToken(id);
  }
}

/** The token with new hit points and temporary ones; full hit points are left out. */
function withHp(token: Token, after: { hp: number; tempHp?: number }, maxHp: number): Token {
  const tempHp = after.tempHp ?? token.tempHp ?? 0;
  return { ...token, hp: after.hp >= maxHp ? undefined : after.hp, tempHp: tempHp > 0 ? tempHp : undefined };
}

export function requireGm(player: Player): void {
  if (!isGm(player)) throw new Refusal('Only the GM can do that');
}
