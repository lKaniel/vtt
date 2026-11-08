import { z } from 'zod';
import type { Background, Species } from './origins.ts';
import { SKILLS } from './origins.ts';
import { ABILITIES, type Edition } from './stats-schema.ts';

// The creator's Custom options: a species and a background the player
// describes instead of picking one from the book. A character names them
// with the id `custom` and carries their details itself.

export const CUSTOM = 'custom';

const Skill = z.enum(Object.keys(SKILLS) as [keyof typeof SKILLS, ...(keyof typeof SKILLS)[]]);
const Trait = z.object({ name: z.string().trim().min(1).max(60), description: z.string().max(2000) });

export const CustomSpeciesSchema = z.object({
  name: z.string().trim().min(1).max(40),
  size: z.enum(['small', 'medium']).default('medium'),
  speed: z.number().int().min(20).max(40).default(30),
  darkvision: z.number().int().min(0).max(120).default(0),
  traits: z.array(Trait).max(10).default([]),
});
export type CustomSpecies = z.infer<typeof CustomSpeciesSchema>;

export const CustomBackgroundSchema = z.object({
  name: z.string().trim().min(1).max(40),
  skills: z.array(Skill).max(2).default([]),
  /** 2024: the three abilities it raises. */
  abilities: z.array(z.enum(ABILITIES)).max(3).optional(),
  /** 2024: the origin feat, in the player's words. */
  feat: Trait.optional(),
});
export type CustomBackground = z.infer<typeof CustomBackgroundSchema>;

/** The custom species as the book's species are, for the rest of the rules. */
export function customSpecies(s: CustomSpecies): Species {
  return {
    id: CUSTOM,
    name: s.name,
    description: '',
    sizes: [s.size],
    speed: s.speed,
    darkvision: s.darkvision,
    bonuses: {},
    traits: s.traits,
    subspecies: [],
  };
}

/** A custom background's tools and languages: two of either (2014) or one tool (2024). */
const CUSTOM_TRAINING = {
  '2014': { fixed: [], choices: [{ id: 'tools-languages', pick: 2, from: ['tools', 'languages'] }] },
  '2024': { fixed: [], choices: [{ id: 'tool', pick: 1, from: ['tools'] }] },
};

export function customBackground(b: CustomBackground, edition: Edition = '2014'): Background {
  return {
    proficiencies: CUSTOM_TRAINING[edition],
    id: CUSTOM,
    name: b.name,
    description: '',
    skills: b.skills,
    ...(b.abilities && { abilities: b.abilities }),
    ...(b.feat && { feat: b.feat }),
    kit: [],
  };
}

interface CustomPicks {
  rules: string;
  species: string;
  background: string;
  customSpecies?: CustomSpecies;
  customBackground?: CustomBackground;
}

export function customSpeciesIssues(c: CustomPicks): string[] {
  return c.species === CUSTOM && !c.customSpecies ? ['Describe your custom species.'] : [];
}

export function customBackgroundIssues(c: CustomPicks): string[] {
  if (c.background !== CUSTOM) return [];
  const b = c.customBackground;
  if (!b) return ['Describe your custom background.'];
  const out: string[] = [];
  if (new Set(b.skills).size !== 2) out.push('Choose 2 background skills.');
  if (c.rules === '2024' && new Set(b.abilities).size !== 3) out.push('Choose 3 abilities your background raises.');
  return out;
}

/** A 2014 custom species raises one ability by 2 and another by 1, any the player likes. */
export function hasFreeBonuses(c: CustomPicks): boolean {
  return c.rules === '2014' && c.species === CUSTOM;
}
