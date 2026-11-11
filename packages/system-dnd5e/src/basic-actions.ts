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
  {
    id: 'hide',
    name: 'Hide',
    level: 1,
    action: 'action',
    recharge: 'long',
    check: { ability: 'dex', skill: 'stealth' },
    effect: { name: 'Hidden', advantage: true, disadvantageAgainst: true, endsOnAttack: true, hides: true },
    description:
      "Make a Dexterity (Stealth) check out of sight. Until you attack, cast a spell or are found, creatures whose passive Perception is lower than the check don't know where you are: you attack them with advantage and they attack you with disadvantage.",
  },
  {
    id: 'help',
    name: 'Help',
    level: 1,
    action: 'action',
    recharge: 'long',
    spell: { targets: 1, range: 5, rounds: 1, effect: { name: 'Helped', advantage: true, once: true, rounds: 1 } },
    description:
      'Aid a creature within 5 feet: it has advantage on its next attack roll before the start of your next turn. For help with an ability check, the GM gives the advantage when asking for the roll.',
  },
  {
    id: 'grapple',
    name: 'Grapple',
    level: 1,
    action: 'attack',
    recharge: 'long',
    spell: {
      targets: 1,
      range: 5,
      save: { ability: 'str', grapple: true },
      effect: { name: 'Grappled', conditions: ['grappled'] },
    },
    description:
      'In place of one attack, seize a creature within 5 feet that is no more than one size larger than you. 2014: your Strength (Athletics) check against its Athletics or Acrobatics. 2024: it makes a Strength or Dexterity save against 8 + your Strength modifier + your proficiency bonus. If it fails it is grappled: its speed is 0 until it escapes (its Escape Grapple action) or the GM ends the effect, and when you walk you drag it along, each foot costing two unless it is two or more sizes smaller.',
  },
  {
    id: 'shove',
    name: 'Shove',
    level: 1,
    action: 'attack',
    recharge: 'long',
    spell: {
      targets: 1,
      range: 5,
      save: { ability: 'str', grapple: true },
      choices: [
        { id: 'prone', name: 'Knock prone', set: { effect: { name: 'Prone', conditions: ['prone'], rounds: 1 } } },
        { id: 'push', name: 'Push 5 feet', set: { push: 5 } },
      ],
    },
    description:
      'In place of one attack, shove a creature within 5 feet that is no more than one size larger than you, resisted like a grapple. If it fails, knock it prone or push it 5 feet away.',
  },
];

/** Offered only while the creature is grappled. */
const ESCAPE: Feature = {
  id: 'escape',
  name: 'Escape Grapple',
  level: 1,
  action: 'action',
  recharge: 'long',
  escape: true,
  description:
    "Try to break free of a grapple: your Strength (Athletics) or Dexterity (Acrobatics) check against the grapple's escape DC (2014: against the grappler's Athletics check).",
};

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
  effects: readonly Pick<Effect, 'name' | 'bonusActions' | 'conditions'>[] = [],
): FeatureSheet[] {
  const held = effects.some((e) => e.conditions?.includes('grappled'));
  return [...features, ...BASIC, ...(held ? [ESCAPE] : []), ...bonusVersions([...features, ...effects])];
}
