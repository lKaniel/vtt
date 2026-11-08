import { z } from 'zod';

// The shape of a spell's area.

export const AreaSchema = z.object({
  /** sphere: radius around a point; emanation: radius around the caster; cone, line and cube start at the caster. */
  shape: z.enum(['sphere', 'emanation', 'cone', 'cube', 'line']),
  /** Feet: radius, cone length, cube side or line length. */
  size: z.number().positive(),
  /** Width of a line in feet. */
  width: z.number().positive().default(5),
});
export type Area = z.infer<typeof AreaSchema>;
