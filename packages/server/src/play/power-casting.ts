import {
  addHold,
  type Effect,
  endedHolds,
  type FeatureSheet,
  featureSpell,
  isLinked,
  pickedNotes,
  pickedSpell,
  poolLeft,
  type PoolSheet,
  powerCost,
  releaseHold,
  type Spell,
  SpellSchema,
  spendPool,
  spendUse,
  type Token,
  weightFor,
  withoutHeld,
} from '@vtt/system-dnd5e';
import { rollPickOf } from './roll-picks.ts';
import type { Player } from '@vtt/shared';
import { randomUUID } from 'node:crypto';
import type { SpellActions } from '../actions/spell-actions.ts';
import type { FeatureRequest } from './feature-casting.ts';
import { summon, summonNotes } from './spell-summons.ts';
import { Refusal, type Cost, type Fighter, type Table } from './table.ts';

// Pool features at the table (power-schema.ts in system-dnd5e): a use costs
// points from the class's pool by its targets' weight and the options
// picked, lasting uses hold their cost while their effects last, reserved
// ones lower the maximums until they're let go, and features of one group
// (Weaves) share one concentration.

export interface PowerRequest extends FeatureRequest {
  /** Option ids picked (senses, shapes). */
  picks?: string[];
  /** Numbers entered (a base cost, a strength). */
  inputs?: Record<string, number>;
  /** Used as a bonus action instead (Quick Weave, Fluid Weaving, Twin Thought). */
  bonus?: boolean;
}

interface Parts {
  table: Table;
  spells: SpellActions;
}

interface Use {
  caster: Fighter;
  feature: FeatureSheet;
  pool: PoolSheet;
  spell: Spell;
  targets: Fighter[];
  cost: number;
  action: Cost;
  by: BonusBy;
  hold?: string;
}

const refused = <T>(fn: () => T): T => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof Refusal) throw e;
    throw new Refusal((e as Error).message);
  }
};

/** Whether the token's feature spends its class's pool. */
export function isPower(table: Table, id: string, featureId: string): boolean {
  const token = table.store.tokens.get(id);
  const sheet = token && table.sheetOf(token);
  return !!sheet?.pool && sheet.features.find((f) => f.id === featureId)?.cost !== undefined;
}

/** The feature's spell with the picked options set over it; its effect keeps the hold going. */
function useSpell(feature: FeatureSheet, picks: readonly string[], hold: string | undefined): Spell {
  const fields = refused(() => pickedSpell(feature, picks));
  const spell = featureSpell({ ...feature, spell: fields });
  if (!hold) return spell;
  return SpellSchema.parse({ ...spell, effect: { name: feature.name, ...spell.effect, hold } });
}

function costOf(
  table: Table,
  { caster, feature, targets }: Pick<Use, 'caster' | 'feature' | 'targets'>,
  req: PowerRequest,
) {
  const spent = feature.max !== undefined && feature.left === 0;
  if (spent && !feature.costWhenSpent) throw new Refusal(`${caster.token.name} has no uses left of ${feature.name}`);
  const formula = spent ? feature.costWhenSpent : feature.cost;
  const others = targets.filter((t) => t.token.id !== caster.token.id);
  const costTargets = others.map((t) => ({
    weight: weightFor(caster.sheet, t.sheet),
    linked: isLinked(table.store.tokens.get(t.token.id) ?? t.token, caster.token.id),
  }));
  const pick = { picks: req.picks ?? [], inputs: req.inputs ?? {}, targets: costTargets };
  return refused(() => powerCost({ ...feature, cost: formula }, pick, feature.classLevel ?? 1));
}

/** Which rule lets a use be a bonus action: cheap enough, a follow-up, or the once-a-turn one. */
type BonusBy = 'own' | 'quick' | 'follow' | 'any';

/** The action a use takes: its own, or a bonus action when a rule allows it. */
function actionOf({ caster, feature, pool, cost }: Omit<Use, 'action' | 'by' | 'spell' | 'targets'>, bonus: boolean) {
  const own: Cost = feature.action ?? 'free';
  if (!bonus || own === 'bonus') return { action: own, by: 'own' as BonusBy };
  const effects = caster.token.effects ?? [];
  const quick = feature.quick !== undefined && cost <= feature.quick * (pool.max + pool.reserved);
  const follow = effects.some((e) => e.bonusFeature === feature.id);
  const any = feature.quickAny && !effects.some((e) => e.id === quickAnyId(caster.token.id));
  const by = (['quick', 'follow', 'any'] as const).find((_, i) => [quick, follow, any][i]);
  if (by) return { action: 'bonus' as Cost, by };
  throw new Refusal(`${caster.token.name} can't use ${feature.name} as a bonus action now`);
}

const quickAnyId = (id: string) => `quick-any-${id}`;

/** Refuses a use the pool can't pay: too few points left, or no room among the held ones. */
function checkPool({ caster, feature, pool, cost }: Pick<Use, 'caster' | 'feature' | 'pool' | 'cost'>): void {
  const left = poolLeft(pool);
  const name = caster.token.name;
  if (feature.reserve) {
    if (cost > pool.max) throw new Refusal(`${name}'s ${pool.name} is too low to hold ${feature.name} (${cost})`);
    return;
  }
  if (cost > left.pool)
    throw new Refusal(`${name} has only ${round(left.pool)} ${pool.name} left (${feature.name} costs ${round(cost)})`);
  if (feature.hold && cost > left.held) {
    throw new Refusal(
      `${name} has no room for ${feature.name}: ${round(left.held)} Concurrent ${pool.name} left, it costs ${round(cost)}`,
    );
  }
}

const round = (n: number) => Math.round(n * 100) / 100;

function prepare(parts: Parts, player: Player, canSee: (id: string) => boolean, req: PowerRequest): Use {
  const { table, spells } = parts;
  const caster = table.actor(player, req.token);
  const feature = caster.sheet.features.find((f) => f.id === req.feature);
  const pool = caster.sheet.pool;
  if (!feature || !pool) throw new Refusal(`${caster.token.name} doesn't have that feature`);
  refuseUse(table, caster, feature);
  const hold = feature.hold || feature.reserve ? `${feature.id}-${randomUUID().slice(0, 8)}` : undefined;
  const spell = useSpell(feature, req.picks ?? [], hold);
  const aim = { ...req, caster: req.token, spell: spell.id, slot: 0, targets: req.targets ?? [] };
  const targets = spells.targets(caster, spell, aim, canSee);
  const cost = costOf(table, { caster, feature, targets }, req);
  const { action, by } = actionOf({ caster, feature, pool, cost, hold }, !!req.bonus);
  checkPool({ caster, feature, pool, cost });
  return { caster, feature, pool, spell, targets, cost, action, by, hold };
}

/** Refuses a feature that can't be used by hand now: a reaction, a ritual in a fight, nothing for it to end. */
function refuseUse(table: Table, caster: Fighter, feature: FeatureSheet): void {
  if (feature.reaction) throw new Refusal(`${feature.name} is a reaction: it's offered when it can be used`);
  if (feature.ritual && table.inFight(caster.token.id)) throw new Refusal(`${feature.name} takes too long in a fight`);
  if (feature.consumes && !newestHold(caster.token, feature.consumes)) {
    throw new Refusal(`${caster.token.name} has nothing for ${feature.name} to end`);
  }
}

const newestHold = (token: Token, feature: string) => token.holds?.filter((h) => h.feature === feature).at(-1);

/** Uses a pool feature: pays its cost, holds or reserves it, keeps the group's concentration, then strikes. */
export function castPower(parts: Parts, player: Player, canSee: (id: string) => boolean, req: PowerRequest): void {
  const { table, spells } = parts;
  const use = prepare(parts, player, canSee, req);
  table.check(use.caster.token, use.action);
  table.pay(use.caster.token, use.action);
  if (use.feature.consumes) releaseNewest(table, use.caster.token.id, use.feature.consumes);
  if (use.spell.concentration) concentrate(table, use);
  table.store.setToken(paid(table.store.tokens.get(use.caster.token.id)!, use));
  const { dc, attack, mod } = use.pool;
  const notes = [`${round(use.cost)} ${use.pool.name}`, ...pickedNotes(use.feature, req.picks ?? [])];
  if (use.spell.summon) notes.push(...conjure(table, use, req));
  spells.strike(
    use.caster.token.id,
    { spell: use.spell, slot: 0, point: req.point, dc, attackBonus: attack, mod, ...rollPickOf(req) },
    use.targets,
    notes,
  );
}

/** What a feature's spell summons (Shadow Substance), built for the class level and the pool's numbers. */
function conjure(table: Table, { caster, feature, pool, spell }: Use, req: PowerRequest): string[] {
  if (!req.point) throw new Refusal(`Pick where ${feature.name} appears`);
  const cast = { slot: feature.classLevel ?? 1, level: 0, attack: pool.attack, mod: pool.mod };
  const fighter = table.fighter(caster.token.id);
  return summonNotes(summon(table, fighter, spell, { point: req.point, slot: 0, cast }));
}

/** Starts concentrating on the feature's group, unless the caster already holds it (another Weave). */
function concentrate(table: Table, { caster, feature }: Use): void {
  const key = feature.group ?? feature.id;
  const token = table.store.tokens.get(caster.token.id)!;
  if (token.concentration?.spell === key) return;
  if (token.concentration) table.endConcentration(token.id);
  const now = table.store.tokens.get(caster.token.id)!;
  table.store.setToken({ ...now, concentration: { spell: key, name: feature.name } });
}

/** The caster after paying: points spent (or reserved), a use spent, the hold kept, and what the action unlocks. */
function paid(token: Token, use: Use): Token {
  const { feature, cost, hold } = use;
  let next = feature.reserve ? token : spendPool(token, cost);
  if (feature.max !== undefined && (feature.left ?? 0) > 0) next = spendUse(next, feature);
  if (hold)
    next = addHold(next, {
      id: hold,
      feature: feature.id,
      name: feature.name,
      cost,
      ...(feature.reserve && { reserve: true }),
    });
  return { ...next, effects: turnMarks(next, use) };
}

/** Effects that track this turn: a follow-up bonus action unlocked (Twin Thought), one used, or Fluid Weaving spent. */
function turnMarks(token: Token, { feature, action, by }: Use): Effect[] | undefined {
  let effects = [...(token.effects ?? [])];
  if (by === 'follow') effects = effects.filter((e) => e.bonusFeature !== feature.id);
  if (by === 'any') effects.push(mark(quickAnyId(token.id), `${feature.name}: bonus action used`, token.id));
  if (action === 'action' && feature.followUp) {
    effects.push({
      ...mark(`follow-${feature.id}-${token.id}`, `${feature.name}: follow up`, token.id),
      bonusFeature: feature.followUp,
    });
  }
  return effects.length ? effects : undefined;
}

const mark = (id: string, name: string, source: string): Effect => ({ id, name, source, rounds: 1 });

function releaseNewest(table: Table, id: string, feature: string): void {
  const hold = newestHold(table.store.tokens.get(id)!, feature);
  if (hold) letGo(table, id, hold.id);
}

/** Ends a held or reserved use: its hold, and the effects that kept it going. */
function letGo(table: Table, id: string, hold: string): void {
  const ids = new Set([hold]);
  for (const token of [...table.store.tokens.values()]) {
    const next = withoutHeld(token, ids);
    if (next !== token) table.store.setToken(next);
  }
  table.store.setToken(releaseHold(table.store.tokens.get(id)!, hold));
}

/** A player lets go of one of their creature's held uses (a Glamour, a Weave). */
export function release(table: Table, player: Player, id: string, hold: string): void {
  const { token } = table.actor(player, id);
  const held = token.holds?.find((h) => h.id === hold);
  if (!held) throw new Refusal(`${token.name} isn't holding that`);
  letGo(table, id, hold);
  table.note(`${token.name} lets ${held.name} go`);
}

/** Drops holds whose effects are all gone (the Weave ended, its concentration broke). */
export function keepHolds(table: Table): void {
  const tokens = [...table.store.tokens.values()];
  for (const token of tokens) {
    if (!token.holds?.length) continue;
    const ended = endedHolds(token, tokens);
    if (ended.length) table.store.setToken(ended.reduce((t, h) => releaseHold(t, h), token));
  }
}
