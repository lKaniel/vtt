import { canPay, type Creature, type FeatureCast, featureCasts, type Spell, type TokenView } from '@vtt/system-dnd5e';
import { lowestSlot } from '../text/spell-text.ts';
import { slotChoices } from './charges.ts';

// What pays for a cast: a slot of some level, or a feature that casts the
// spell without one (Feature `freeCasts`: favored enemy, an invocation, a
// class pool's points).

type Sheet = Partial<Pick<Creature, 'features' | 'pool'>> | undefined;

/** The features that can pay for `spell` now: those that cast it and have a use left (or need none) or the points. */
function payingFeatures(sheet: Sheet, spell: Spell): FeatureCast[] {
  return featureCasts({ features: sheet?.features ?? [], pool: sheet?.pool }, spell).filter((c) => canPay(sheet, c));
}

/** The feature `id` paying for `spell`, when it can. */
export function payingFeature(sheet: Sheet, spell: Spell, id: string | undefined): FeatureCast | undefined {
  return id ? payingFeatures(sheet, spell).find((c) => c.feature === id) : undefined;
}

/** What a spell is paid with when first aimed: a feature's free cast before a slot, else the lowest slot left. */
export function firstPayment(token: TokenView, spell: Spell): { slot: number | undefined; paidBy?: string } {
  const feature = payingFeatures(token.sheet, spell)[0];
  return feature ? { slot: feature.level, paidBy: feature.feature } : { slot: lowestSlot(token, spell) };
}

/** How many ways the token can pay for `spell`: slot levels with a slot left, and features with a use. */
export function paymentCount(token: TokenView, spell: Spell): number {
  const caster = token.sheet?.caster;
  if (caster?.atWill?.includes(spell.id)) return 1;
  const slots = caster && spell.level > 0 ? slotChoices(spell, caster).filter((c) => c.left > 0).length : 0;
  return slots + payingFeatures(token.sheet, spell).length;
}

/** One way to pay for a cast, as the roll dialog lists it. */
export interface PaymentOption {
  key: string;
  slot: number;
  /** The feature paying instead of a slot, and its name. */
  paidBy?: string;
  name?: string;
  /** Cast without spending anything. */
  free?: true;
  /** Slots of this level, or uses of the feature, left. */
  left?: number;
}

/** Every way the token can pay for `spell`: slot levels with a slot left, features with a use, and nothing at all (at `slot`). */
export function paymentOptions(token: TokenView, spell: Spell, slot: number): PaymentOption[] {
  const caster = token.sheet?.caster;
  if (spell.level === 0 || !caster || caster.atWill?.includes(spell.id)) return [];
  const slots = slotChoices(spell, caster).filter((c) => c.left > 0);
  return [
    ...slots.map((c) => ({ key: `slot-${c.level}`, slot: c.level, left: c.left })),
    ...payingFeatures(token.sheet, spell).map((c) => ({
      key: `feature-${c.feature}`,
      slot: c.level,
      paidBy: c.feature,
      name: c.name,
      left: c.left,
    })),
    { key: 'free', slot, free: true as const },
  ];
}

/** The option a cast is paid with as it stands. */
export function paymentKey(cast: { slot: number; paidBy?: string; free?: boolean }): string {
  if (cast.paidBy) return `feature-${cast.paidBy}`;
  return cast.free ? 'free' : `slot-${cast.slot}`;
}
