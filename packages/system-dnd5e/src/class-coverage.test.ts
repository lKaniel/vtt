import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import type { Class, Feature } from './spell-schema.ts';
import type { Edition } from './stats-schema.ts';

// Every class and subclass feature up to 20th level, and every option to pick
// there, either does something in the engine or says how the GM runs it.

const MAX_LEVEL = 20;

const MECHANICS: (keyof Feature)[] = [
  'action',
  'uses',
  'heal',
  'effect',
  'passive',
  'unarmoredAc',
  'grantsSpells',
  'freeCasts',
  'spellPicks',
  'spell',
  'bonusActions',
  'poolPerLevel',
  'usesFrom',
  'grantAction',
  'grantAttacks',
  'speed',
  'dash',
  'meleeDamage',
  'healPool',
  'auraRadius',
  'saveProficiencies',
  'manual',
];

/** Features the engine runs from the class itself or by id. */
const RUN_BY_CLASS: Record<string, (c: Class) => boolean> = {
  spellcasting: (c) => !!c.spellcasting,
  'pact-magic': (c) => !!c.spellcasting,
  'extra-attack': (c) => !!c.attacks,
  'extra-attack-2': (c) => !!c.attacks,
  'extra-attack-3': (c) => !!c.attacks,
  'two-extra-attacks': (c) => !!c.attacks,
  'three-extra-attacks': (c) => !!c.attacks,
  'improved-divine-smite': () => true, // weapon-attack.ts
  'radiant-strikes': () => true, // weapon-attack.ts
  'sneak-attack': (c) => !!c.sneakAttack,
  'weapon-mastery': (c) => !!c.weaponMastery,
  'divine-smite': () => true, // riders.ts
  'uncanny-dodge': () => true, // hit-reactions.ts
  'jack-of-all-trades': () => true, // checks.ts
};

function unexplained(cls: Class): string[] {
  const parts = [
    { name: cls.id, features: cls.features, choices: cls.choices ?? [] },
    ...(cls.subclasses ?? []).map((s) => ({
      name: `${cls.id}/${s.id}`,
      features: s.features,
      choices: s.choices ?? [],
    })),
  ];
  return parts.flatMap(({ name, features, choices }) => {
    const hosts = new Set(choices.map((c) => c.id));
    const explained = (f: Feature) =>
      MECHANICS.some((k) => f[k] !== undefined) || hosts.has(f.id) || !!RUN_BY_CLASS[f.id]?.(cls);
    const hostSays = (f: Feature) => !!f.choice && !!features.find((h) => h.id === f.choice)?.manual;
    return features.filter((f) => f.level <= MAX_LEVEL && !explained(f) && !hostSays(f)).map((f) => `${name}: ${f.id}`);
  });
}

describe.each(['2014', '2024'] as Edition[])('%s class features to 20th level', (edition) => {
  it('are run by the engine or say why the GM runs them', () => {
    expect([...srdFor(edition).classes.values()].flatMap(unexplained)).toEqual([]);
  });
});
