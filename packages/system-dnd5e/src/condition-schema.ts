import { z } from 'zod';

// The conditions of the rules (blinded, charmed, ...).

export const ConditionSchema = z.enum([
  'blinded',
  'charmed',
  'deafened',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
]);
export type Condition = z.infer<typeof ConditionSchema>;
