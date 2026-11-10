import {
  castProblem,
  featureCastProblem,
  featureCasts,
  type FeatureCast,
  payWithFeature,
  type Spell,
} from '@vtt/system-dnd5e';
import { Refusal, type Fighter, type Table } from './table.ts';

// Spells a feature pays for instead of a slot (Feature `freeCasts`): which
// feature, the level it casts at, who it may land on, and spending its use.

/** The feature `id` paying for `spell`; refuses one that can't. */
function featurePayment(caster: Fighter, spell: Spell, id: string): FeatureCast {
  const problem = featureCastProblem(caster.sheet, spell, id);
  if (problem) throw new Refusal(`${caster.token.name} ${problem}`);
  return featureCasts(caster.sheet, spell).find((c) => c.feature === id)!;
}

/** What pays for a cast, checked: a slot, nothing (`free`) or a feature. `slot`: the level it goes off at. */
export interface Payment {
  slot: number;
  /** The slot level spent; 0 for none. */
  spend: number;
  paid?: FeatureCast;
}

/** Cast without a slot: the GM's free cast, or a non-caster's homemade spell (CasterSheet `atWill`). */
export function castsFree(caster: Fighter, spell: Spell, req: { free?: boolean }): boolean {
  return !!req.free || !!caster.sheet.caster?.atWill?.includes(spell.id);
}

/** How the cast `req` asks for is paid; refuses one the caster can't make that way. */
export function payment(
  caster: Fighter,
  spell: Spell,
  req: { slot: number; free?: boolean; paidBy?: string },
): Payment {
  const paid = req.paidBy ? featurePayment(caster, spell, req.paidBy) : undefined;
  const free = castsFree(caster, spell, req) || !!paid;
  const asked = paid?.level ?? req.slot;
  const problem = castProblem({ spell, slot: asked, sheet: caster.sheet, free });
  if (problem) throw new Refusal(`${caster.token.name} ${problem}`);
  const slot = spell.level === 0 ? 0 : asked;
  return { slot, spend: free ? 0 : slot, ...(paid && { paid }) };
}

/** A self-only free cast lands on its caster, whoever was aimed at. */
export function paidTargets(caster: Fighter, paid: FeatureCast | undefined, targets: string[]): string[] {
  return paid?.self ? [caster.token.id] : targets;
}

/** Pays for the cast: its slot, and the use of the feature that paid instead. */
export function spendPayment(table: Table, casterId: string, { spend, paid }: Omit<Payment, 'slot'>): void {
  table.spendSlot(casterId, spend);
  if (!paid) return;
  const token = table.store.tokens.get(casterId)!;
  table.store.setToken(payWithFeature(token, table.fighter(casterId).sheet, paid.feature));
}

/** What the log says about a cast that spent no slot. */
export function paymentNotes(paid: FeatureCast | undefined, free: boolean): string[] {
  if (paid) return [`cast with ${paid.name}`];
  return free ? ['cast without a spell slot'] : [];
}
