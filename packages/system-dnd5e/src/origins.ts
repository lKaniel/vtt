import { z } from 'zod';
import origins51 from '../content/srd/origins-5.1.json' with { type: 'json' };
import origins52 from '../content/srd/origins-5.2.json' with { type: 'json' };
import { ABILITIES, type Edition } from './stats-schema.ts';

// What the character creator offers: species, backgrounds and each class's
// skill picks, subclasses and starting kit. Generated from the SRD packs by
// import-srd (scripts/origins-convert.ts); 5.1 for 2014, 5.2 for 2024.

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const Ability = z.enum(ABILITIES);
const Bonuses = z.partialRecord(Ability, z.number().int());

const TraitSchema = z.object({ name: z.string(), description: z.string() });
export type Trait = z.infer<typeof TraitSchema>;

const SubspeciesSchema = z.object({
  id,
  name: z.string(),
  description: z.string(),
  bonuses: Bonuses,
  traits: z.array(TraitSchema),
  darkvision: z.number().optional(),
});
export type Subspecies = z.infer<typeof SubspeciesSchema>;

export const SpeciesSchema = z.object({
  id,
  name: z.string(),
  description: z.string(),
  sizes: z.array(z.enum(['small', 'medium'])).min(1),
  speed: z.number(),
  darkvision: z.number(),
  /** Fixed ability bonuses (2014). */
  bonuses: Bonuses,
  /** "+1 to two other abilities" (half-elf). */
  bonusChoice: z.object({ count: z.number().int(), amount: z.number().int(), from: z.array(Ability) }).optional(),
  traits: z.array(TraitSchema),
  /** Subraces (2014) or lineages (2024). */
  subspecies: z.array(SubspeciesSchema),
});
export type Species = z.infer<typeof SpeciesSchema>;

const KitItemSchema = z.object({ item: id, qty: z.number().int().positive(), equipped: z.boolean() });

export const KitStepSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  /** Only offered when an earlier step picked this option. */
  when: z.object({ step: z.string(), option: z.string() }).optional(),
  options: z.array(z.object({ id: z.string(), label: z.string(), items: z.array(KitItemSchema) })),
});
export type KitStep = z.infer<typeof KitStepSchema>;

export const BackgroundSchema = z.object({
  id,
  name: z.string(),
  description: z.string(),
  skills: z.array(id),
  /** 2024: the three abilities it raises (+2/+1 or +1 each). */
  abilities: z.array(Ability).optional(),
  feat: TraitSchema.optional(),
  kit: z.array(KitStepSchema),
});
export type Background = z.infer<typeof BackgroundSchema>;

export const ClassOptionsSchema = z.object({
  id,
  skills: z.object({ pick: z.number().int(), from: z.array(id) }),
  subclassLevel: z.number().int(),
  subclasses: z.array(z.object({ id, name: z.string(), description: z.string() })),
  kit: z.array(KitStepSchema),
});
export type ClassOptions = z.infer<typeof ClassOptionsSchema>;

export const GearSchema = z.object({ type: z.literal('gear'), id, name: z.string(), weight: z.number() });

export const OriginsSchema = z.object({
  species: z.array(SpeciesSchema),
  backgrounds: z.array(BackgroundSchema),
  classes: z.array(ClassOptionsSchema),
  /** Gear the kits hand out that items.json doesn't have. */
  gear: z.array(GearSchema),
});
export type Origins = z.infer<typeof OriginsSchema>;

const ORIGINS: Record<Edition, Origins> = {
  '2014': OriginsSchema.parse(origins51),
  '2024': OriginsSchema.parse(origins52),
};

export function originsFor(edition: Edition): Origins {
  return ORIGINS[edition];
}

/** The 18 skills and the ability each uses. */
export const SKILLS = {
  acrobatics: 'dex',
  'animal-handling': 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  'sleight-of-hand': 'dex',
  stealth: 'dex',
  survival: 'wis',
} as const satisfies Record<string, (typeof ABILITIES)[number]>;
export type Skill = keyof typeof SKILLS;

export function skillName(skill: string): string {
  return skill
    .split('-')
    .map((w) => (w === 'of' ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(' ');
}
