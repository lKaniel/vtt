import { z } from 'zod';

// What a class, species or background gives besides skills: armor, weapons,
// tools and languages it always gives (`fixed`), and picks it offers
// (`choices`). Hand-written, by id: classes in class-automation.json,
// species and backgrounds in origin-automation.json.

/** A pick: `pick` of the ids or groups in `from` ("languages", "artisans-tools", "musical-instruments"...). */
export const TrainingChoiceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  pick: z.number().int().min(1).max(5),
  from: z.array(z.string().min(1)).min(1),
});
export type TrainingChoice = z.infer<typeof TrainingChoiceSchema>;

export const GrantsSchema = z.object({
  fixed: z.array(z.string().min(1)).default([]),
  choices: z.array(TrainingChoiceSchema).default([]),
});
export type Grants = z.infer<typeof GrantsSchema>;

/** A class's grants at 1st level, and the fewer it gives a character multiclassing into it. */
export const ClassTrainingSchema = GrantsSchema.extend({ multiclass: GrantsSchema.optional() });
export type ClassTraining = z.infer<typeof ClassTrainingSchema>;
