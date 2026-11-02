import type { FeatureSheet } from './classes.ts';
import type { Effect, Feature } from './spell-schema.ts';

// What any creature can do with its action besides attacking and casting,
// and the class features that make some of them bonus actions.

const BASIC: Feature[] = [
  {
    id: 'dash',
    name: 'Dash',
    level: 1,
    action: 'action',
    recharge: 'long',
    dash: true,
    description: 'Gain extra movement equal to your speed for this turn.',
  },
  {
    id: 'dodge',
    name: 'Dodge',
    level: 1,
    action: 'action',
    recharge: 'long',
    effect: { name: 'Dodging', disadvantageAgainst: true, saveAdvantage: ['dex'], rounds: 1 },
    description:
      'Until the start of your next turn, attacks against you have disadvantage and you make Dexterity saves with advantage.',
  },
  {
    id: 'disengage',
    name: 'Disengage',
    level: 1,
    action: 'action',
    recharge: 'long',
    effect: { name: 'Disengaged', disengaged: true, rounds: 1 },
    description: "Your movement doesn't provoke opportunity attacks for the rest of the turn.",
  },
];

/** Bonus action versions of basic actions a feature allows (cunning action). */
function bonusVersions(features: readonly Pick<FeatureSheet, 'name' | 'bonusActions'>[]): FeatureSheet[] {
  return features.flatMap((f) =>
    (f.bonusActions ?? []).flatMap((id) => {
      const basic = BASIC.find((b) => b.id === id);
      if (!basic) return [];
      const name = f.name.split(':')[0]!;
      return [
        {
          ...basic,
          id: `${name.toLowerCase().split(' ')[0]}-${id}`,
          name: `${basic.name} (${name})`,
          action: 'bonus' as const,
        },
      ];
    }),
  );
}

/** A creature's features with the basic actions everyone has added after them. */
export function withBasicActions(
  features: readonly FeatureSheet[],
  effects: readonly Pick<Effect, 'name' | 'bonusActions'>[] = [],
): FeatureSheet[] {
  return [...features, ...BASIC, ...bonusVersions([...features, ...effects])];
}
