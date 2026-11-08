import {
  animationRef,
  type CasterSheet,
  type CastingTime,
  type CastOutcome,
  castProblem,
  type CastResult,
  type Effect,
  isDying,
  lastingEffects,
  makesDeathSaves,
  manualNote,
  withAgain,
  withChoice,
  resolveCast,
  type Spell,
  type SpellLog,
  type Token,
  spendResistance,
  stoppedBy,
} from '@vtt/system-dnd5e';
import { gridKind, isGridless, placeToken, type Player, type Point, roll } from '@vtt/shared';
import { castBreaksSanctuary, passSanctuaries } from '../play/spell-wards.ts';
import { shaped } from '../play/spell-forms.ts';
import { summon, summonNotes } from '../play/spell-summons.ts';
import { itemCasting, scrollReader, spentFrom } from '../play/spell-items.ts';
import { type DoorPick, doorAt, setDoor } from '../play/spell-doors.ts';
import { breakTimeStop } from '../play/time-stop.ts';
import { SpellTargets } from '../play/spell-targets.ts';
import { stepAside } from '../play/pool-guards.ts';
import { Refusal, type Cost, type Fighter, type Table } from '../play/table.ts';

export interface CastRequest {
  caster: string;
  repeat?: boolean;
  spell: string;
  slot: number;
  free?: boolean;
  targets: string[];
  point?: Point;
  summon?: string;
  scroll?: boolean;
  /** Cast from the magic item at this inventory index (a wand of fireballs). */
  item?: number;
  /** The spell's option (see Spell `choices`); a lasting spell used again keeps the one it was cast with. */
  choice?: string;
  /** The monster a shape-shifting spell turns its targets into (polymorph). */
  form?: string;
}

/** A cast about to take effect, which others may still stop. */
export interface PendingCast {
  caster: Fighter;
  spell: Spell;
  slot: number;
  /** It goes through. */
  go(): void;
  /** It was stopped; 2024 counterspell leaves the slot unspent. */
  fail(keepsSlot: boolean): void;
}

interface Casting {
  caster: Fighter;
  spell: Spell;
  req: CastRequest;
  plan: Plan;
  reader?: CasterSheet;
  targets: Fighter[];
  door?: DoorPick;
}

/** What casting costs: the action, slot and slot spent; using a lasting spell again needs no slot. */
interface Plan {
  cost: Cost;
  slot: number;
  spend: number;
  again: boolean;
  /** The DC it was handed on with (dragon's breath): the original caster's. */
  dc?: number;
}

const COST: Record<CastingTime, Cost> = {
  action: 'action',
  bonus: 'bonus',
  reaction: 'reaction',
  minute: 'free',
  hour: 'free',
};

/** What a strike rolls with: the spell and slot, and numbers of its own (a scroll's, a pool feature's). */
interface Strike {
  spell: Spell;
  slot: number;
  point?: Point;
  reader?: CasterSheet;
  dc?: number;
  attackBonus?: number;
  mod?: number;
}

/** The effects a result leaves after its healing: its own (unless it raised the maximum first) and any more. */
const laterEffects = (r: CastResult, first: boolean): Effect[] => [
  ...(r.effect && !first ? [r.effect] : []),
  ...(r.effects ?? []),
];

/** Casting spells: checks, slots, targets, concentration, and applying what the spell did. */
export class SpellActions {
  constructor(
    private table: Table,
    private logSpell: (log: SpellLog) => void,
    /** A cast may wait for others to react (counterspell): true when it waits. */
    private interrupt: (cast: PendingCast) => boolean = () => false,
  ) {
    this.aiming = new SpellTargets(table);
  }

  private aiming: SpellTargets;

  private get store() {
    return this.table.store;
  }

  private get grid() {
    return this.store.world.gridSize;
  }

  cast(player: Player, canSee: (id: string) => boolean, req: CastRequest): void {
    const actor = this.table.actor(player, req.caster);
    const known = this.table.content(actor.token).spells.get(req.spell);
    if (!known) throw new Refusal(`There is no spell called ${req.spell}`);
    const { caster, plan, reader } = this.prepare(actor, known, req);
    const picked = chosen(caster, known, req.choice, plan.again);
    this.table.check(caster.token, plan.cost);
    const targets = this.aim(caster, picked, { ...req, slot: plan.slot }, { canSee, again: plan.again });
    const door = picked.door ? doorAt(this.store, req.point!, picked.door) : undefined;
    const spell = shaped(this.table, caster, picked, { form: req.form, targets });
    passSanctuaries(this.table, caster, spell, targets);
    this.table.pay(caster.token, plan.cost);
    castBreaksSanctuary(this.table, caster, spell, targets);
    const casting: Casting = { caster, spell, req, plan, reader, targets, door };
    const pending: PendingCast = {
      caster,
      spell,
      slot: plan.slot,
      go: () => this.finish(casting),
      fail: (keepsSlot) => this.fail(casting, keepsSlot),
    };
    if (plan.again || !this.interrupt(pending)) pending.go();
  }

  /** The cast goes through: slot, concentration, lasting effects, and what it does. */
  private finish({ caster, spell, req, plan, reader, targets, door }: Casting): void {
    if (plan.again && spell.steer) return this.steer(caster, spell, req.point!);
    if (!plan.again) this.begin(caster, spell, plan, req.item ?? !!reader);
    if (!plan.again) this.addLasting(caster.token.id, lastingEffects(caster.token, spell, plan.slot, req.point));
    const notes = this.conjure(caster, spell, { ...req, slot: plan.slot }, door);
    const free = req.free && plan.slot > 0 && !plan.again ? ['cast without a spell slot'] : [];
    this.strike(caster.token.id, { spell, slot: plan.slot, point: req.point, reader, dc: plan.dc }, targets, [
      ...free,
      ...notes,
    ]);
  }

  /** Compulsion used again: the creatures it holds are made to walk toward `point` as their turns start. */
  private steer(caster: Fighter, spell: Spell, point: Point): void {
    for (const token of [...this.store.tokens.values()]) {
      const held = (e: Effect) => e.spell === spell.id && e.source === caster.token.id;
      if (!token.effects?.some(held)) continue;
      const effects = token.effects.map((e) => (held(e) ? { ...e, towards: point } : e));
      this.store.setToken({ ...token, effects });
    }
    this.table.note(`${caster.token.name} compels them toward a point`);
  }

  /** The cast was countered: it does nothing, and its slot (or scroll) is gone unless `keepsSlot`. */
  private fail({ caster, spell, plan, reader, req }: Casting, keepsSlot: boolean): void {
    if (!keepsSlot) this.table.spendSlot(caster.token.id, plan.spend);
    const now = this.store.tokens.get(caster.token.id)!;
    if (!keepsSlot && reader)
      this.store.setToken(spentFrom(now, this.table.content(now), { spell, slot: plan.slot }, req.item ?? true));
    this.table.note(`${caster.token.name}'s ${spell.name} fails`);
  }

  /** What the spell does besides hitting its targets: moves its caster, works a door, summons, or readies a weapon attack. */
  private conjure(caster: Fighter, spell: Spell, req: CastRequest, door: DoorPick | undefined): string[] {
    if (spell.teleport) this.teleport(caster.token.id, req.point!);
    if (spell.door) setDoor(this.store, door!, spell.door);
    if (spell.weaponStrike) this.readyStrike(caster.token.id);
    if (spell.extraTurns) this.stopTime(caster.token.id, spell);
    if (!spell.summon) return [];
    return summonNotes(summon(this.table, this.table.fighter(caster.token.id), spell, req));
  }

  /** 2024 true strike: the attack it is cast with comes on top of the action that cast it. */
  private readyStrike(id: string): void {
    const token = this.store.tokens.get(id)!;
    const left = this.table.budget(token);
    if (left) this.table.setBudget(token, { ...left, attacks: left.attacks + 1 });
  }

  /** Time stop: the caster's turns to come, in a row. */
  private stopTime(id: string, spell: Spell): void {
    const extraTurns = roll(spell.extraTurns!, this.table.rng).total;
    this.addEffect(id, { id: `${spell.id}-${id}`, name: spell.name, extraTurns, source: id, spell: spell.id });
  }

  /** Who the spell hits now: no one when casting only conjures it (flame blade) or its zone waits for creatures to enter. */
  private aim(
    caster: Fighter,
    spell: Spell,
    req: CastRequest,
    how: { canSee: (id: string) => boolean; again: boolean },
  ) {
    if (spell.steer && !req.point) throw new Refusal(`Pick where ${spell.name} sends them`);
    if ((!how.again && !spell.attackOnCast) || spell.steer) return [];
    const aimed = this.targets(caster, spell, req, how.canSee);
    return spell.zone && !spell.zone.onCast && !how.again ? [] : aimed;
  }

  /** What casting costs: the action, slot and slot spent; using a lasting spell again needs no slot. */
  private plan(caster: Fighter, spell: Spell, req: CastRequest): Plan {
    if (req.repeat) {
      const going = caster.sheet.effects.find((e) => e.repeat?.spell === spell.id);
      if (!going || !spell.repeat) throw new Refusal(`${spell.name} isn't going`);
      const stopped = stoppedBy(caster.sheet, spell);
      if (stopped) throw new Refusal(`${caster.token.name} ${stopped}`);
      return { cost: spell.repeat, slot: going.repeat!.slot, spend: 0, again: true, dc: going.repeat!.dc };
    }
    const problem = castProblem({ spell, slot: req.slot, sheet: caster.sheet, free: req.free });
    if (problem) throw new Refusal(`${caster.token.name} ${problem}`);
    if ((spell.castingTime === 'minute' || spell.castingTime === 'hour') && this.table.inFight(caster.token.id)) {
      throw new Refusal(`${spell.name} takes too long to cast in a fight`);
    }
    const slot = spell.level === 0 ? 0 : req.slot;
    return { cost: COST[spell.castingTime], slot, spend: req.free ? 0 : slot, again: false };
  }

  /** Who casts and how: with their own spellcasting, or reading a scroll with its numbers. */
  private prepare(
    actor: Fighter,
    spell: Spell,
    req: CastRequest,
  ): { caster: Fighter; plan: Plan; reader?: CasterSheet } {
    if (req.item !== undefined) return this.fromItem(actor, spell, req);
    if (!req.scroll) return { caster: actor, plan: this.plan(actor, spell, req) };
    const reader = scrollReader(actor, spell);
    const caster = { ...actor, sheet: { ...actor.sheet, caster: reader } };
    return { caster, plan: this.scrollPlan(caster, spell), reader };
  }

  /** A spell from a magic item: its charges pay instead of a slot, with its DC when it has one. */
  private fromItem(
    actor: Fighter,
    spell: Spell,
    req: CastRequest,
  ): { caster: Fighter; plan: Plan; reader: CasterSheet } {
    const content = this.table.content(actor.token);
    const { pick, reader } = itemCasting(content, actor, spell, { item: req.item!, slot: req.slot });
    const plan = { ...this.scrollPlan(actor, spell), slot: pick.slot };
    return { caster: { ...actor, sheet: { ...actor.sheet, caster: reader } }, plan, reader };
  }

  /** A scroll's spell: cast at its own level with no slot, in a fight only on your turn like any other. */
  private scrollPlan(caster: Fighter, spell: Spell): Plan {
    const stopped = stoppedBy(caster.sheet, spell);
    if (stopped) throw new Refusal(`${caster.token.name} ${stopped}`);
    if ((spell.castingTime === 'minute' || spell.castingTime === 'hour') && this.table.inFight(caster.token.id)) {
      throw new Refusal(`${spell.name} takes too long to cast in a fight`);
    }
    return { cost: COST[spell.castingTime], slot: spell.level, spend: 0, again: false };
  }

  /** Rolls a spell from `casterId` against `targets`, applies it and logs it: casts, features and zones. `reader`: read from a scroll. */
  strike(casterId: string, opts: Strike, targets: Fighter[], notes: string[] = []): void {
    const { spell, slot, point, reader } = opts;
    const fighter = this.table.fighter(casterId);
    const caster = reader ? { ...fighter, sheet: { ...fighter.sheet, caster: reader } } : fighter;
    const grid = gridKind(this.store.world);
    const { dc, attackBonus, mod } = opts;
    const rolled = resolveCast(
      { spell, slot, caster, targets, gridSize: this.grid, grid, dc, attackBonus, mod },
      this.table.rng,
    );
    const outcome = stepAside(this.table, caster, rolled);
    this.apply(outcome);
    breakTimeStop(
      this.table,
      casterId,
      outcome.results.map((r) => r.target),
    );
    const pushed = this.push(caster.token, outcome);
    const drained = this.drain(casterId, outcome.drained);
    this.log(caster, { spell, slot, point }, outcome, [...notes, ...pushed, ...drained]);
  }

  private addLasting(id: string, effects: Effect[]): void {
    for (const e of effects) this.addEffect(id, e);
  }

  /** Spends the slot (the scroll, or the item's charges at `from`), ends invisibility and starts concentrating. */
  private begin(caster: Fighter, spell: Spell, plan: Plan, from: boolean | number): void {
    if (spell.concentration && caster.token.concentration) this.table.endConcentration(caster.token.id);
    this.table.spendSlot(caster.token.id, plan.spend);
    const now = this.store.tokens.get(caster.token.id)!;
    const token = spentFrom(now, this.table.content(now), { spell, slot: plan.slot }, from);
    const effects = token.effects?.filter((e) => !e.endsOnAttack);
    this.store.setToken({
      ...token,
      effects: effects?.length ? effects : undefined,
      concentration: spell.concentration ? { spell: spell.id, name: spell.name } : token.concentration,
    });
  }

  targets(caster: Fighter, spell: Spell, req: CastRequest, canSee: (id: string) => boolean): Fighter[] {
    return this.aiming.targets(caster, spell, req, canSee);
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
    for (const e of laterEffects(r, first)) this.addEffect(r.target, e);
    if (r.stabilized) this.stabilize(r.target);
    if (r.cured) this.cure(r.target, r.cured);
    if (r.revived) this.revive(r.target, r.hp);
    if (r.killed) this.kill(r.target);
    if (r.save?.legendary) this.resist(r.target);
  }

  /** The target turned a failed save into a success: one legendary resistance is gone. */
  private resist(id: string): void {
    const token = this.store.tokens.get(id);
    if (!token) return;
    this.store.setToken(spendResistance(token));
    this.table.note(`${token.name} uses Legendary Resistance to succeed instead`);
  }

  private cure(id: string, effects: readonly string[]): void {
    const token = this.store.tokens.get(id);
    if (!token) return;
    const left = (token.effects ?? []).filter((e) => !effects.includes(e.id));
    this.store.setToken({ ...token, effects: left.length ? left : undefined });
  }

  /** Killed outright: a character is dead, not dying. */
  private kill(id: string): void {
    const token = this.store.tokens.get(id);
    if (!token) return;
    const dead = makesDeathSaves(token) ? { deathSaves: { successes: 0, failures: 3, dead: true } } : {};
    this.store.setToken({ ...token, hp: 0, ...dead });
    this.table.note(`${token.name} dies`);
  }

  private revive(id: string, hp: number): void {
    const token = this.store.tokens.get(id);
    if (!token) return;
    const max = this.table.sheetOf(token)?.maxHp ?? hp;
    this.store.setToken({ ...token, hp: hp >= max ? undefined : hp, deathSaves: undefined });
    this.table.note(`${token.name} returns to life`);
  }

  /** Healing, damage or temporary hit points from one result. */
  private applyHp(r: CastResult): void {
    const target = this.table.fighter(r.target);
    if (r.healed !== undefined) {
      const tempHp = r.tempHp ?? target.token.tempHp;
      this.store.setToken({ ...target.token, hp: r.hp >= target.sheet.maxHp ? undefined : r.hp, tempHp });
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
    const [x, y] = isGridless(this.store.world) ? point : placeToken(point, token.size, this.store.world);
    this.store.setToken({ ...token, x, y });
  }

  private log(
    caster: Fighter,
    { spell, slot, point }: { spell: Spell; slot: number; point?: Point },
    outcome: CastOutcome,
    extra: string[],
  ): void {
    const name = (id: string) => this.store.tokens.get(id)?.name ?? id;
    const notes = [...extra];
    const manual = manualNote(spell);
    if (manual) notes.push(manual);
    if (spell.automated && spell.gmNote) notes.push(`GM: ${spell.gmNote}`);
    const down = new Set(outcome.results.filter((r) => r.damage > 0 && r.hp <= 0).map((r) => r.target));
    for (const id of down) notes.push(`${name(id)} is down`);
    this.logSpell({
      caster: caster.token.name,
      spell: spell.name,
      casterId: caster.token.id,
      spellId: spell.id,
      animation: caster.token.animations?.[animationRef('spell', spell.id)],
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

/** The spell with the option picked for it: the one asked for, else the one a going spell was cast with, else the first. */
function chosen(caster: Fighter, spell: Spell, choice: string | undefined, again: boolean): Spell {
  const going = caster.sheet.effects.find((e) => e.repeat?.spell === spell.id)?.repeat?.choice;
  try {
    const picked = withChoice(spell, choice ?? going);
    return again ? withAgain(picked) : picked;
  } catch (e) {
    throw new Refusal((e as Error).message);
  }
}
