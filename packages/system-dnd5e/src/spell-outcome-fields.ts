import { z } from 'zod';

// Spell fields for what a cast does besides damage and effects: a door it
// works, where it moves its caster or targets, and exhaustion it adds.

export const spellOutcomeFields = {
  /** Opens the locked door nearest the point (knock), or locks a closed one (arcane lock). */
  door: z.enum(['unlock', 'lock']).optional(),
  /** Moves the caster up to this many feet to a point they can see (misty step). */
  teleport: z.number().positive().optional(),
  /** Feet each creature hit (or failing its save) is moved: positive pushes away from the caster, negative pulls closer. */
  push: z.number().int().optional(),
  /** Exhaustion levels a target gains when it lands (a sphinx's Weight of Years). */
  exhaustion: z.number().int().min(1).max(6).optional(),
};
