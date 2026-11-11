import { type FeatureSheet, type OptionGroup, powerCost } from '@vtt/system-dnd5e';
import { t } from '../i18n/index.ts';

// Using a pool feature (an illusionist's Weave or bolt): the options picked
// and numbers entered while it is aimed, and using it as a bonus action.

export interface PowerAim {
  picks: string[];
  inputs: Record<string, number>;
  bonus: boolean;
}

/** Whether a feature spends a pool and so is used with picks. */
export const isPowerFeature = (f: Pick<FeatureSheet, 'cost'> | undefined): boolean => f?.cost !== undefined;

/** A fresh aim: the first option of each group that must have one, every input at its default. */
export function powerAim(feature: FeatureSheet): PowerAim {
  const picks = (feature.options ?? []).flatMap((g) => (g.required || g.pick === 'one' ? [g.list[0]!.id] : []));
  const inputs = Object.fromEntries((feature.inputs ?? []).map((i) => [i.id, i.default]));
  return { picks, inputs, bonus: feature.action === 'bonus' };
}

const groupOf = (feature: FeatureSheet, option: string): OptionGroup | undefined =>
  feature.options?.find((g) => g.list.some((o) => o.id === option));

/** Picks an option or takes it back; a "one" group swaps to it, and a required one keeps at least one. */
export function togglePick(aim: PowerAim, feature: FeatureSheet, option: string): PowerAim {
  const group = groupOf(feature, option);
  if (!group) return aim;
  const siblings = new Set(group.list.map((o) => o.id));
  if (group.pick === 'one') return { ...aim, picks: [...aim.picks.filter((p) => !siblings.has(p)), option] };
  if (!aim.picks.includes(option)) return { ...aim, picks: [...aim.picks, option] };
  const left = aim.picks.filter((p) => p !== option);
  const keeps = !group.required || left.some((p) => siblings.has(p));
  return keeps ? { ...aim, picks: left } : aim;
}

/** The fields a feature message carries for a pool feature. */
export function powerFields(aim: PowerAim | undefined): {
  picks?: string[];
  inputs?: Record<string, number>;
  bonus?: boolean;
} {
  if (!aim) return {};
  return {
    picks: aim.picks,
    ...(Object.keys(aim.inputs).length && { inputs: aim.inputs }),
    ...(aim.bonus && { bonus: true }),
  };
}

/** What a use costs with `weight` on its one target; NaN when the picks don't add up yet. */
function costAt(feature: FeatureSheet, pick: Pick<PowerAim, 'picks' | 'inputs'>, weight: number): number {
  try {
    return powerCost(feature, { ...pick, targets: [{ weight }] }, feature.classLevel ?? 1);
  } catch {
    return Number.NaN;
  }
}

/** The cost with no target weights known: exact when the formula needs none, else per unit of weight. */
export function costHint(feature: FeatureSheet, pick: Pick<PowerAim, 'picks' | 'inputs'>): string {
  const flat = costAt(feature, pick, 0);
  const per = costAt(feature, pick, 1) - flat;
  const shown = (n: number) => String(Math.round(n * 100) / 100);
  if (Number.isNaN(flat)) return '';
  if (per === 0) return t('power.cost', { cost: shown(flat) });
  return t('power.costWeight', { cost: shown(per) }) + (flat ? ` + ${shown(flat)}` : '');
}
