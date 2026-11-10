import { z } from 'zod';
import { PointSchema } from './schema.ts';

// The GM's fog of war tools: paint explored ground in or out with a round
// brush dragged along `path` (one stroke is one edit, one undo), or forget it all. `players` limits an edit to those seats; without
// it the edit is for every player.

const players = z.array(z.string()).max(50).optional();
const path = z.array(PointSchema).min(1).max(1000);
/** The floor edited (a scene level id); a reset without one forgets every floor. */
const level = z.string().max(100).optional();

export const FogEditSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('reveal'), path, radius: z.number().positive().max(10000), players, level }),
  z.object({ op: z.literal('hide'), path, radius: z.number().positive().max(10000), players, level }),
  z.object({ op: z.literal('reset'), players, level }),
]);
export type FogEdit = z.infer<typeof FogEditSchema>;
