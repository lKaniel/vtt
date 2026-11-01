import {
  type CastingTime,
  type CastOutcome,
  castProblem,
  type CastResult,
  type Effect,
  inArea,
  isDying,
  joinCombat,
  lastingEffects,
  resolveCast,
  scaledSpell,
  type Spell,
  type SpellLog,
  type Token,
  tokenDistance,
  TokenSchema,
} from '@vtt/system-dnd5e';
import type { Player, Point } from '@vtt/shared';
import { Refusal, type Cost, type Fighter, type Table } from './table.ts';

export interface CastRequest {
  caster: string;
  repeat?: boolean;
  spell: string;
  slot: number;
  free?: boolean;
  targets: string[];
  point?: Point;
  summon?: string;
}

const COST: Record<CastingTime, Cost> = {
  action: 'action',
  bonus: 'bonus',
  reaction: 'reaction',
  minute: 'free',
  hour: 'free',
};

/** Casting spells: checks, slots, targets, concentration, and applying what the spell did. */
export class SpellActions {
  constructor(
    private table: Table,
    private logSpell: (log: SpellLog) => void,
  ) {}

  private get store() {
    return this.table.store;
  }

  private get grid() {
    return this.store.world.gridSize;
  }

  cast(player: Player, canSee: (id: string) => boolean, req: CastRequest): void {
    const caster = this.table.actor(player, req.caster);
    const spell = this.table.content(caster.token).spells.get(req.spell);
    if (!spell) throw new Refusal(`There is no spell called ${req.spell}`);
    const plan = this.plan(caster, spell, req);
    this.table.check(caster.token, plan.cost);
    const aimed = this.targets(caster, spell, { ...req, slot: plan.slot }, canSee);
    const targets = spell.zone && !spell.zone.onCast && !plan.again ? [] : aimed;
    this.table.pay(caster.token, plan.cost);
    if (!plan.again) this.begin(caster, spell, plan.spend);
    if (!plan.again) this.addLasting(caster.token.id, lastingEffects(caster.token, spell, plan.slot, req.point));
    if (spell.teleport) this.teleport(caster.token.id, req.point!);
    const summoned = spell.summon ? this.summon(this.table.fighter(caster.token.id), spell, req) : [];
    const free = req.free && plan.slot > 0 && !plan.again ? ['cast without a spell slot'] : [];
    this.strike(caster.token.id, { spell, slot: plan.slot, point: req.point }, targets, [
      ...free,
      ...summonNotes(summoned),
    ]);
  }

  /** What casting costs: the action, slot and slot spent; using a lasting spell again needs no slot. */
  private plan(
    caster: Fighter,
    spell: Spell,
    req: CastRequest,
  ): { cost: Cost; slot: number; spend: number; again: boolean } {
    if (req.repeat) {
      const going = caster.sheet.effects.find((e) => e.repeat?.spell === spell.id);
      if (!going || !spell.repeat) throw new Refusal(`${spell.name} isn't going`);
      return { cost: spell.repeat, slot: going.repeat!.slot, spend: 0, again: true };
    }
    const problem = castProblem({ spell, slot: req.slot, sheet: caster.sheet, free: req.free });
    if (problem) throw new Refusal(`${caster.token.name} ${problem}`);
    if ((spell.castingTime === 'minute' || spell.castingTime === 'hour') && this.table.inFight(caster.token.id)) {
      throw new Refusal(`${spell.name} takes too long to cast in a fight`);
    }
    const slot = spell.level === 0 ? 0 : req.slot;
    return { cost: COST[spell.castingTime], slot, spend: req.free ? 0 : slot, again: false };
  }

  /** Rolls a spell from `casterId` against `targets`, applies it and logs it: casts, features and zones. */
  strike(
    casterId: string,
    { spell, slot, point }: { spell: Spell; slot: number; point?: Point },
    targets: Fighter[],
    notes: string[] = [],
  ): void {
    const caster = this.table.fighter(casterId);
    const outcome = resolveCast({ spell, slot, caster, targets, gridSize: this.grid }, this.table.rng);
    this.apply(outcome);
    const pushed = this.push(caster.token, outcome);
    const drained = this.drain(casterId, outcome.drained);
    this.log(caster, { spell, slot, point }, outcome, [...notes, ...pushed, ...drained]);
  }

  private addLasting(id: string, effects: Effect[]): void {
    for (const e of effects) this.addEffect(id, e);
  }

  /** Spends the slot, ends invisibility and starts concentrating. */
  private begin(caster: Fighter, spell: Spell, slot: number): void {
    if (spell.concentration && caster.token.concentration) this.table.endConcentration(caster.token.id);
    this.table.spendSlot(caster.token.id, slot);
    const token = this.store.tokens.get(caster.token.id)!;
    const effects = token.effects?.filter((e) => !e.endsOnAttack);
    this.store.setToken({
      ...token,
      effects: effects?.length ? effects : undefined,
      concentration: spell.concentration ? { spell: spell.id, name: spell.name } : token.concentration,
    });
  }

  // ---- Targets -----------------------------------------------------------

  targets(caster: Fighter, spell: Spell, req: CastRequest, canSee: (id: string) => boolean): Fighter[] {
    if (spell.teleport || spell.summon) {
      this.checkPoint(caster, spell, req.point, spell.teleport ?? spell.range);
      return [];
    }
    if (spell.area) return this.areaTargets(caster, spell, req.point);
    const scaled = scaledSpell(spell, req.slot, caster.sheet.caster?.level ?? 1);
    if (scaled.targets === 0) return [this.table.fighter(caster.token.id)];
    const most = scaled.beams > 1 ? scaled.beams : scaled.targets;
    if (!req.targets.length) throw new Refusal(`Pick a target for ${spell.name}`);
    if (req.targets.length > most) throw new Refusal(`${spell.name} can target at most ${most}`);
    return req.targets.map((id) => this.creatureTarget(caster, spell, id, canSee));
  }

  private creatureTarget(caster: Fighter, spell: Spell, id: string, canSee: (id: string) => boolean): Fighter {
    if (!canSee(id)) throw new Refusal('No such target');
    const target = this.table.fighter(id);
    const feet = tokenDistance(caster.token, target.token, this.grid);
    if (feet > Math.max(5, spell.range)) throw new Refusal(`${target.token.name} is out of range (${feet} ft)`);
    if (!this.table.clearShot([caster.token.x, caster.token.y], [target.token.x, target.token.y])) {
      throw new Refusal(`${caster.token.name} has no clear path to ${target.token.name}`);
    }
    return target;
  }

  private checkPoint(caster: Fighter, spell: Spell, point: Point | undefined, range: number): Point {
    if (!point) throw new Refusal(`Pick a point for ${spell.name}`);
    const from: Point = [caster.token.x, caster.token.y];
    const feet = (Math.hypot(point[0] - from[0], point[1] - from[1]) / this.grid) * 5;
    if (range > 0 && feet > range + 2.5) throw new Refusal(`That point is out of range (${Math.round(feet)} ft)`);
    if (!this.table.clearShot(from, point)) throw new Refusal(`${caster.token.name} can't see that point`);
    return point;
  }

  /** Every creature in the area that the area's origin has a clear line to. */
  private areaTargets(caster: Fighter, spell: Spell, point: Point | undefined): Fighter[] {
    const aim =
      spell.range > 0
        ? this.checkPoint(caster, spell, point, spell.range)
        : (point ?? [caster.token.x + 1, caster.token.y]);
    const origin: Point = spell.area!.shape === 'sphere' || spell.range > 0 ? aim : [caster.token.x, caster.token.y];
    const area = { area: spell.area!, range: spell.range };
    return [...this.store.tokens.values()]
      .filter((t) => inArea(area, { caster: caster.token, aim, token: t, gridSize: this.grid }))
      .filter((t) => this.table.clearShot(origin, [t.x, t.y]))
      .flatMap((t) => {
        const sheet = this.table.sheetOf(t);
        return sheet ? [{ token: t, sheet }] : [];
      });
  }

  // ---- Results -----------------------------------------------------------

  private apply(outcome: CastOutcome): void {
    for (const r of outcome.results) this.applyOne(r);
    this.table.useUp(outcome.used);
  }

  private applyOne(r: CastResult): void {
    // A raised maximum (aid) is in place before the healing that fills it.
    const first = r.healed !== undefined;
    if (r.effect && first) this.addEffect(r.target, r.effect);
    this.applyHp(r);
    if (r.effect && !first) this.addEffect(r.target, r.effect);
    if (r.stabilized) this.stabilize(r.target);
    if (r.cured) this.cure(r.target, r.cured);
    if (r.revived) this.revive(r.target);
  }

  private cure(id: string, effects: readonly string[]): void {
    const token = this.store.tokens.get(id);
    if (!token) return;
    const left = (token.effects ?? []).filter((e) => !effects.includes(e.id));
    this.store.setToken({ ...token, effects: left.length ? left : undefined });
  }

  private revive(id: string): void {
    const token = this.store.tokens.get(id);
    if (!token) return;
    this.store.setToken({ ...token, hp: 1, deathSaves: undefined });
    this.table.note(`${token.name} returns to life`);
  }

  /** Healing, damage or temporary hit points from one result. */
  private applyHp(r: CastResult): void {
    const target = this.table.fighter(r.target);
    if (r.healed !== undefined) {
      this.store.setToken({ ...target.token, hp: r.hp >= target.sheet.maxHp ? undefined : r.hp });
    } else if (r.damage > 0) {
      this.table.hurt(target.token, r, r.damage);
    } else if (r.tempHp !== undefined) {
      this.store.setToken({ ...target.token, tempHp: r.tempHp || undefined });
    }
  }

  /** Pushes or pulls everyone the spell moves, from where the caster stands. */
  private push(caster: Token, outcome: CastOutcome): string[] {
    const notes: string[] = [];
    for (const r of outcome.results) {
      if (!r.push) continue;
      const feet = this.table.forceMove(r.target, [caster.x, caster.y], r.push);
      const name = this.store.tokens.get(r.target)?.name ?? r.target;
      if (feet > 0) notes.push(`${name} is ${r.push > 0 ? 'pushed' : 'pulled'} ${feet} ft`);
    }
    return notes;
  }

  private stabilize(id: string): void {
    const token = this.store.tokens.get(id);
    if (!token || !isDying(token)) return;
    this.store.setToken({ ...token, deathSaves: { successes: 0, failures: 0, ...token.deathSaves, stable: true } });
    this.table.note(`${token.name} is stable`);
  }

  /** The caster regains hit points from what the spell drained. */
  private drain(id: string, amount: number | undefined): string[] {
    if (!amount) return [];
    const { token, sheet } = this.table.fighter(id);
    const hp = Math.min(sheet.maxHp, sheet.hp + amount);
    this.store.setToken({ ...token, hp: hp >= sheet.maxHp ? undefined : hp });
    return [`${token.name} regains ${hp - sheet.hp} HP`];
  }

  private addEffect(id: string, effect: Effect): void {
    const token = this.store.tokens.get(id);
    if (!token) return;
    const effects = [...(token.effects ?? []).filter((e) => e.id !== effect.id), effect];
    this.store.setToken({ ...token, effects });
  }

  private teleport(id: string, point: Point): void {
    const token = this.store.tokens.get(id)!;
    const [x, y] = this.snap(point, token.size);
    this.store.setToken({ ...token, x, y });
  }

  private snap([x, y]: Point, size: number): Point {
    const g = this.grid;
    const axis = (v: number) => (size % 2 ? (Math.floor(v / g) + 0.5) * g : Math.round(v / g) * g);
    return [axis(x), axis(y)];
  }

  // ---- Summons -----------------------------------------------------------

  private summon(caster: Fighter, spell: Spell, req: CastRequest): Token[] {
    const options = spell.summon!.options;
    const choice = options.find((o) => o.monster === req.summon) ?? (options.length === 1 ? options[0] : undefined);
    if (!choice) throw new Refusal(`Pick what ${spell.name} summons: ${options.map((o) => o.monster).join(', ')}`);
    const monster = this.table.content(caster.token).monsters.get(choice.monster);
    if (!monster) throw new Refusal(`There is no ${choice.monster} in the bestiary`);
    const spots = this.freeSpots(this.snap(req.point!, monster.size), monster.size, choice.count);
    const tokens = spots.map(([x, y], i) =>
      TokenSchema.parse({
        id: this.freeId(choice.monster, i),
        name: choice.count > 1 ? `${monster.name} ${i + 1}` : monster.name,
        x,
        y,
        size: monster.size,
        color: caster.token.color,
        speed: monster.speed,
        darkvision: monster.darkvision,
        monster: monster.id,
        ownership: caster.token.ownership,
        summon: { by: caster.token.id, spell: spell.id, concentration: spell.concentration },
        leader: spell.summon!.turn === 'shared' ? caster.token.id : undefined,
      }),
    );
    for (const t of tokens) this.store.setToken(t);
    const combat = this.store.combat;
    if (combat && spell.summon!.turn === 'own' && this.table.inFight(caster.token.id)) {
      this.store.setCombat(
        joinCombat(
          combat,
          caster.token.id,
          tokens.map((t) => t.id),
        ),
      );
    }
    return tokens;
  }

  private freeId(base: string, from: number): string {
    let n = from + 1;
    while (this.store.tokens.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }

  /** `count` squares around `start` with no token on them, nearest first. */
  private freeSpots(start: Point, size: number, count: number): Point[] {
    const g = this.grid * size;
    const taken = new Set([...this.store.tokens.values()].map((t) => `${t.x},${t.y}`));
    const out: Point[] = [];
    for (let ring = 0; out.length < count && ring < 10; ring++) {
      for (const p of ringAround(start, ring, g)) {
        if (out.length < count && !taken.has(`${p[0]},${p[1]}`)) {
          out.push(p);
          taken.add(`${p[0]},${p[1]}`);
        }
      }
    }
    return out;
  }

  private log(
    caster: Fighter,
    { spell, slot, point }: { spell: Spell; slot: number; point?: Point },
    outcome: CastOutcome,
    extra: string[],
  ): void {
    const name = (id: string) => this.store.tokens.get(id)?.name ?? id;
    const notes = [...extra];
    if (!spell.automated) notes.push('not automated: the GM applies it');
    if (spell.automated && spell.gmNote) notes.push(`GM: ${spell.gmNote}`);
    const down = new Set(outcome.results.filter((r) => r.damage > 0 && r.hp <= 0).map((r) => r.target));
    for (const id of down) notes.push(`${name(id)} is down`);
    this.logSpell({
      caster: caster.token.name,
      spell: spell.name,
      casterId: caster.token.id,
      spellId: spell.id,
      damageType: spell.damage[0]?.type,
      attackKind: spell.attack,
      point,
      area: spell.area,
      slot,
      results: outcome.results.map((r) => ({
        target: name(r.target),
        targetId: r.target,
        attack: r.attack,
        hit: r.hit,
        crit: r.crit,
        save: r.save && { ability: r.save.ability, dc: r.save.dc, total: r.save.total, success: r.save.success },
        damage: r.damage,
        healed: r.healed,
        effect: r.effect?.name,
        immune: r.immune,
      })),
      notes,
    });
  }
}

function summonNotes(summoned: readonly Token[]): string[] {
  return summoned.length ? [`${summoned.map((t) => t.name).join(', ')} appear`] : [];
}

/** The squares on the edge of a square ring `ring` steps out from `c`. */
function ringAround(c: Point, ring: number, step: number): Point[] {
  if (ring === 0) return [c];
  const out: Point[] = [];
  for (let dx = -ring; dx <= ring; dx++) {
    for (let dy = -ring; dy <= ring; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) out.push([c[0] + dx * step, c[1] + dy * step]);
    }
  }
  return out;
}
