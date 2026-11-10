import {
  type Spell,
  featureProblem,
  type FeatureSheet,
  featureSpell,
  poolSpell,
  spendUse,
  type RollChoice,
  withChoice,
} from '@vtt/system-dnd5e';
import type { Player, Point } from '@vtt/shared';
import type { SpellActions } from '../actions/spell-actions.ts';
import { afterSpellFinisher } from './momentum-keeper.ts';
import { rollPickOf } from './roll-picks.ts';
import { Refusal, type Cost, type Fighter, type Table } from './table.ts';

/** `edge` and `crit`: the user's roll pick for the feature's attack. */
export interface FeatureRequest extends RollChoice {
  token: string;
  feature: string;
  targets?: string[];
  point?: Point;
  /** The option picked for a feature aimed like a spell with choices (elemental art's damage type). */
  choice?: string;
}

/** Hit points a healing pool spends on its target: what it's missing, as far as the pool goes. */
function poolHealing(feature: FeatureSheet, targets: readonly Fighter[]): number {
  const target = targets[0];
  const missing = target ? target.sheet.maxHp - target.sheet.hp : 0;
  if (missing <= 0) throw new Refusal(`${target?.token.name ?? 'Nobody'} isn't hurt`);
  return Math.min(missing, feature.left ?? 0);
}

/** The spell with the option picked; refuses one it doesn't have. */
function chosen(spell: Spell, choice: string | undefined): Spell {
  try {
    return withChoice(spell, choice);
  } catch {
    throw new Refusal(`${spell.name} has no option called ${choice}`);
  }
}

/** A grapple or shove takes a creature no more than one size larger. */
function fitsInHands(caster: Fighter, targets: readonly Fighter[]): void {
  const big = targets.find((t) => t.token.size > caster.token.size + 1);
  if (big) throw new Refusal(`${big.token.name} is too big for ${caster.token.name} to move`);
}

/** Uses a feature aimed like a spell (bardic inspiration, lay on hands, turn undead): one use, no slot. */
export function castFeature(
  { table, spells }: { table: Table; spells: SpellActions },
  player: Player,
  canSee: (id: string) => boolean,
  req: FeatureRequest,
): void {
  const caster = table.actor(player, req.token);
  const problem = featureProblem(caster.sheet, req.feature);
  if (problem) throw new Refusal(`${caster.token.name} ${problem}`);
  const feature = caster.sheet.features.find((f) => f.id === req.feature)!;
  const cost: Cost = feature.action ?? 'free';
  table.check(caster.token, cost);
  let spell = chosen(poolSpell(featureSpell(feature), feature, caster.sheet), req.choice);
  const aim = { ...req, caster: req.token, spell: spell.id, slot: 0, targets: req.targets ?? [] };
  const targets = spells.targets(caster, spell, aim, canSee);
  if (spell.save?.grapple) fitsInHands(caster, targets);
  const spend = feature.healPool ? poolHealing(feature, targets) : 1;
  if (feature.healPool) spell = { ...spell, heal: String(spend) };
  table.pay(caster.token, cost, caster.sheet.attacksPerAction);
  table.store.setToken(spendUse(table.store.tokens.get(caster.token.id)!, feature, spend, caster.sheet));
  const before = hpOf(table, targets);
  spells.strike(caster.token.id, { spell, slot: 0, point: req.point, ...rollPickOf(req) }, targets);
  if (feature.finisher) afterSpellFinisher(table, { caster, feature, targets, before });
}

const hpOf = (table: Table, targets: readonly Fighter[]) =>
  new Map(targets.map((t) => [t.token.id, table.fighter(t.token.id).sheet.hp]));
