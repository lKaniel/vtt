import { IdSchema } from '@vtt/core';
import { z } from 'zod';
import type { CheckKind } from './checks.ts';
import type { Content } from './content.ts';
import { SKILLS, skillName } from './origins.ts';
import { type Ability, ABILITIES, type Stats } from './stats-schema.ts';

// Skills a campaign adds to the 18 (Psychic Resistance, rolled with Wisdom):
// a homebrew document of kind "skill" or a pack compendium of type `skill`.
// They join the game's content as `skills`, and the sheet lists them after
// the 18; a check names a skill and its ability, so rolling one needs nothing more.

export const SkillDefSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  /** The ability it uses (Wisdom when missing), or "none": each character types its own bonus (`stats.skillValues`). */
  ability: z.enum([...ABILITIES, 'none']).default('wis'),
  description: z.string().optional(),
});
export type SkillDef = z.infer<typeof SkillDefSchema>;

const BASE: readonly SkillDef[] = Object.entries(SKILLS).map(([id, ability]) => ({
  id,
  name: skillName(id),
  ability,
}));

/** The 18 skills, then the game's own (a game's skill of an SRD skill's id is left out). */
export function gameSkills(content: Pick<Content, 'skills'>): SkillDef[] {
  const extra = [...(content.skills?.values() ?? [])].filter((s) => !(s.id in SKILLS));
  return [...BASE, ...extra];
}

/** The ability a skill uses: an SRD skill's, else the game's skill's ("none": a typed bonus); undefined for an unknown skill. */
export function skillAbility(content: Pick<Content, 'skills'>, skill: string): SkillDef['ability'] | undefined {
  if (skill in SKILLS) return SKILLS[skill as keyof typeof SKILLS];
  return content.skills?.get(skill)?.ability;
}

/**
 * The check that rolls a skill. A skill with no ability is `free`: its bonus
 * is the creature's typed value; it still names Wisdom, which only decides
 * which ability-wide effects (advantage, disadvantage) reach it. A
 * character's own pick (`stats.skillAbilities`) replaces the skill's ability.
 */
export function skillCheck(def: Pick<SkillDef, 'id' | 'ability'>, stats?: Pick<Stats, 'skillAbilities'>): CheckKind {
  const id = def.id;
  const ability = stats?.skillAbilities?.[id] ?? def.ability;
  return ability === 'none' ? { ability: FREE_SKILL_ABILITY, skill: id, free: true } : { ability, skill: id };
}

const FREE_SKILL_ABILITY: Ability = 'wis';
