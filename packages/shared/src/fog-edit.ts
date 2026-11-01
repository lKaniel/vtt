import { z } from 'zod';
import { PointSchema } from './schema.ts';

// The GM's fog of war tools: paint explored ground in or out with a round
// brush, or forget it all. `players` limits an edit to those seats; without
// it the edit is for every player.

const players = z.array(z.string()).max(50).optional();

export const FogEditSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('reveal'), at: PointSchema, radius: z.number().positive().max(10000), players }),
  z.object({ op: z.literal('hide'), at: PointSchema, radius: z.number().positive().max(10000), players }),
  z.object({ op: z.literal('reset'), players }),
]);
export type FogEdit = z.infer<typeof FogEditSchema>;
