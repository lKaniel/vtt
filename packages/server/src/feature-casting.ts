import { featureProblem, featureSpell, spendUse, type FeatureSheet, type Player, type Point } from '@vtt/shared';
import type { SpellActions } from './spell-actions.ts';
import { Refusal, type Cost, type Fighter, type Table } from './table.ts';

export interface FeatureRequest {
  token: string;
  feature: string;
  targets?: string[];
  point?: Point;
}

/** Hit points a healing pool spends on its target: what it's missing, as far as the pool goes. */
function poolHealing(feature: FeatureSheet, targets: readonly Fighter[]): number {
  const target = targets[0];
  const missing = target ? target.sheet.maxHp - target.sheet.hp : 0;
  if (missing <= 0) throw new Refusal(`${target?.token.name ?? 'Nobody'} isn't hurt`);
  return Math.min(missing, feature.left ?? 0);
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
  let spell = featureSpell(feature);
  const aim = { ...req, caster: req.token, spell: spell.id, slot: 0, targets: req.targets ?? [] };
  const targets = spells.targets(caster, spell, aim, canSee);
  const spend = feature.healPool ? poolHealing(feature, targets) : 1;
  if (feature.healPool) spell = { ...spell, heal: String(spend) };
  table.pay(caster.token, cost);
  table.store.setToken(spendUse(table.store.tokens.get(caster.token.id)!, feature, spend));
  spells.strike(caster.token.id, { spell, slot: 0, point: req.point }, targets);
}
