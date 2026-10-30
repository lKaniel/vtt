import {
  applyDamage,
  attackRange,
  canControlToken,
  currentTurn,
  hasLineOfSight,
  leaveCombat,
  nextTurn,
  resolveCreature,
  rollAttack,
  editionOf,
  srdFor,
  startCombat,
  tokenDistance,
  type AttackLog,
  type Combat,
  type Creature,
  type Player,
  type Point,
  type Rng,
  type Token,
  type TurnInfo,
} from '@vtt/shared';
import type { WorldStore } from './world-store.ts';

/** A request the rules don't allow; its message goes back to the player. */
export class Refusal extends Error {}

export interface AttackRequest {
  attacker: string;
  target: string;
  attack: string;
}

/** What the fight reports to the chat log. */
export interface CombatLog {
  attack: (log: AttackLog) => void;
  note: (text: string) => void;
}

interface Fighter {
  token: Token;
  sheet: Creature;
}

/**
 * Combat rules on top of the world: starting fights, turns, movement
 * budgets, attacks and equipment. Each method either applies the change to
 * the store or throws a Refusal.
 */
export class CombatActions {
  constructor(
    private store: WorldStore,
    private rng: Rng,
    private log: CombatLog,
  ) {}

  start(player: Player, ids: readonly string[]): void {
    requireGm(player);
    const fighters = ids.map((id) => this.fighter(id));
    const combat = startCombat(
      fighters.map((f) => ({ token: f.token.id, bonus: f.sheet.initiative, speed: f.token.speed })),
      this.rng,
    );
    this.store.setCombat(combat);
    const names = new Map(fighters.map((f) => [f.token.id, f.token.name]));
    const order = combat.order.map((e) => `${names.get(e.token)} ${e.initiative}`).join(', ');
    this.log.note(`Roll for initiative! ${order}`);
  }

  end(player: Player): void {
    requireGm(player);
    this.store.setCombat(undefined);
  }

  endTurn(player: Player): void {
    const combat = this.requireCombat();
    const token = this.store.tokens.get(currentTurn(combat) ?? '');
    if (token && !canControlToken(token, player)) throw new Refusal("It's not your turn");
    this.store.setCombat(nextTurn(combat, this.turnInfo));
  }

  /** Checks that `token` may walk `feet` now, and spends the movement in a fight. */
  move(token: Token, feet: number): void {
    const combat = this.store.combat;
    if (!combat || !this.inFight(combat, token.id)) return;
    this.requireTurn(combat, token);
    if (feet > combat.left.move) {
      throw new Refusal(`${token.name} has only ${combat.left.move} ft of movement left`);
    }
    this.store.setCombat({ ...combat, left: { ...combat.left, move: combat.left.move - feet } });
  }

  attack(player: Player, canSee: (id: string) => boolean, req: AttackRequest): void {
    const attacker = this.fighter(req.attacker);
    if (!canControlToken(attacker.token, player)) throw new Refusal(`You don't control ${attacker.token.name}`);
    if (!canSee(req.target)) throw new Refusal('No such target');
    const target = this.fighter(req.target);
    const attack = attacker.sheet.attacks.find((a) => a.name === req.attack);
    if (!attack) throw new Refusal(`${attacker.token.name} has no attack called ${req.attack}`);
    if (attacker.sheet.hp <= 0) throw new Refusal(`${attacker.token.name} is down`);
    this.checkAction(attacker.token);
    const feet = tokenDistance(attacker.token, target.token, this.store.world.gridSize);
    const range = attackRange(attack, feet);
    if (range === 'out') throw new Refusal(`${target.token.name} is out of range (${feet} ft)`);
    if (!this.clearShot(attacker.token, target.token)) throw new Refusal(`${attacker.token.name} has no clear shot`);
    const result = rollAttack(attack, target.sheet, { disadvantage: range === 'long' }, this.rng);
    const parts = result.damage.map((d) => ({ amount: d.roll.total, type: d.type }));
    const { dealt, hp } = applyDamage(target.sheet, parts);
    this.commitAction(attacker.token);
    if (result.hit) this.store.setToken({ ...target.token, hp });
    const notes: string[] = [];
    if (range === 'long') notes.push('long range: disadvantage');
    if (result.hit && hp <= 0) notes.push(`${target.token.name} is down`);
    this.log.attack({
      attacker: attacker.token.name,
      target: target.token.name,
      attack: attack.name,
      d20: result.d20,
      hit: result.hit,
      crit: result.crit,
      damage: dealt.reduce((sum, d) => sum + d, 0),
      parts: result.damage.map((d, i) => ({ ...d, dealt: dealt[i]! })),
      notes,
    });
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
    if (!combat || !this.inFight(combat, id)) return;
    const after = leaveCombat(combat, id, this.turnInfo);
    this.store.setCombat(after.order.length ? after : undefined);
  }

  private readonly turnInfo: TurnInfo = (id) => {
    const token = this.store.tokens.get(id);
    if (!token) return undefined;
    const sheet = this.sheetOf(token);
    return { speed: token.speed, active: !sheet || sheet.hp > 0 };
  };

  private fighter(id: string): Fighter {
    const token = this.store.tokens.get(id);
    if (!token) throw new Refusal('No such token');
    const sheet = this.sheetOf(token);
    if (!sheet) throw new Refusal(`${token.name} has no stats`);
    return { token, sheet };
  }

  private sheetOf(token: Token): Creature | undefined {
    return resolveCreature(token, srdFor(editionOf(token, this.store.world)));
  }

  private requireCombat(): Combat {
    if (!this.store.combat) throw new Refusal('There is no fight going on');
    return this.store.combat;
  }

  private inFight(combat: Combat, id: string): boolean {
    return combat.order.some((e) => e.token === id);
  }

  private requireTurn(combat: Combat, token: Token): void {
    if (currentTurn(combat) !== token.id) throw new Refusal(`It's not ${token.name}'s turn`);
  }

  /** Checks the attacker has its action; `commitAction` spends it once the attack happens. */
  private checkAction(token: Token): void {
    const combat = this.store.combat;
    if (!combat || !this.inFight(combat, token.id)) return;
    this.requireTurn(combat, token);
    if (!combat.left.action) throw new Refusal(`${token.name} has already used their action`);
  }

  private commitAction(token: Token): void {
    const combat = this.store.combat;
    if (!combat || !this.inFight(combat, token.id)) return;
    this.store.setCombat({ ...combat, left: { ...combat.left, action: false } });
  }

  private clearShot(from: Token, to: Token): boolean {
    const a: Point = [from.x, from.y];
    const b: Point = [to.x, to.y];
    return hasLineOfSight(a, b, this.store.wallsBetween(a, b));
  }
}

function requireGm(player: Player): void {
  if (player.role !== 'gm') throw new Refusal('Only the GM can do that');
}
