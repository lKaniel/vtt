import { z } from 'zod';
import automation from '../content/srd/species-automation.json' with { type: 'json' };
import { characterLevel } from './multiclass.ts';
import { AbilitySchema, type Feature, FeatureSchema } from './spell-schema.ts';
import type { Ability, Edition } from './stats-schema.ts';
import type { Token } from './token-schema.ts';

// Spells a character's species or lineage gives (species-automation.json):
// a tiefling's infernal legacy, a 2024 elf's or gnome's lineage. They are
// features like a class's: cantrips known from 1st level, the rest cast
// once a long rest without a slot from the character level they come at.

const ByEdition = z.partialRecord(z.enum(['2014', '2024']), z.array(FeatureSchema));
const SpeciesAutomationSchema = z.object({
  species: z.record(z.string(), ByEdition),
  lineages: z.record(z.string(), ByEdition),
  /** The ability a species' or lineage's spells are cast with, by edition, where the rules name one. */
  abilities: z.record(z.string(), z.partialRecord(z.enum(['2014', '2024']), AbilitySchema)),
});

const AUTOMATION = SpeciesAutomationSchema.parse(automation);

/** The features the token's species (`stats.species`) and lineage (`stats.lineage`) give at its level. */
export function speciesFeatures(token: Pick<Token, 'stats'>, edition: Edition): Feature[] {
  const { species, lineage } = token.stats ?? {};
  const level = characterLevel(token.stats) ?? 1;
  const of = (group: Record<string, z.infer<typeof ByEdition>>, key: string | undefined) =>
    (key ? group[key]?.[edition] : undefined) ?? [];
  const all = [...of(AUTOMATION.species, species), ...of(AUTOMATION.lineages, lineage)];
  return all.filter((f) => f.level <= level);
}

const MENTAL = ['int', 'wis', 'cha'] as const;

/**
 * The ability the token's species spells are cast with: the one the rules name (a 2014 tiefling's
 * Charisma), the one the character picked (`stats.speciesAbility`), else its best of Int, Wis and Cha.
 */
export function speciesAbility(token: Pick<Token, 'stats'>, edition: Edition): Ability {
  const { species, lineage, speciesAbility: picked, abilities = {} } = token.stats ?? {};
  const named = (key: string | undefined) => (key ? AUTOMATION.abilities[key]?.[edition] : undefined);
  const best = MENTAL.reduce((top, k) => ((abilities[k] ?? 10) > (abilities[top] ?? 10) ? k : top));
  return named(lineage) ?? named(species) ?? picked ?? best;
}
