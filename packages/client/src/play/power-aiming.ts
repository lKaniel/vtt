import type { FeatureSheet, OptionGroup } from '@vtt/system-dnd5e';

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
