import { z } from 'zod';

// How much of D&D runs itself for one seat, like Midi-QOL's per-player
// settings. Kept on the seat (Player.settings), so it follows the player to
// any device.

export const AutomationSchema = z
  .object({
    /** When an enemy walks out of reach: offer the attack, take it at once, or never offer it. */
    opportunity: z.enum(['ask', 'auto', 'never']).default('ask'),
    /** When an attack is about to hit: offer shield or uncanny dodge, or let it land. */
    hitReactions: z.enum(['ask', 'never']).default('ask'),
  })
  .strict();
export type Automation = z.infer<typeof AutomationSchema>;

/** A seat's automation, with the defaults for what it never set (or set to something unknown). */
export function automationOf(settings: Readonly<Record<string, string>> | undefined): Automation {
  const parsed = AutomationSchema.safeParse(settings ?? {});
  return parsed.success ? parsed.data : AutomationSchema.parse({});
}
