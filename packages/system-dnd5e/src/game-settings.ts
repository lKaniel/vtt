import { z } from 'zod';
import type { Content } from './content.ts';

// The GM's options for the whole game, kept in game.json `settings` (the
// engine stores them as strings and leaves their meaning to the system).

export const GameSettingsSchema = z
  .object({
    /**
     * capacity: over Strength × 15 lb, speed drops to 5 ft. variant: the PHB
     * variant, slower over Strength × 5 and × 10. off: weight isn't counted.
     */
    encumbrance: z.enum(['capacity', 'variant', 'off']).default('capacity'),
  })
  .strict();
export type GameSettings = z.infer<typeof GameSettingsSchema>;

const DEFAULTS = GameSettingsSchema.parse({});

/** A game's settings, with the defaults for what it never set; an unknown value falls back to its default. */
export function gameSettingsOf(settings: Readonly<Record<string, unknown>> | undefined): GameSettings {
  const out: Record<string, unknown> = { ...DEFAULTS };
  for (const [key, value] of Object.entries(settings ?? {})) {
    const parsed = GameSettingsSchema.safeParse({ ...DEFAULTS, [key]: value });
    if (parsed.success) out[key] = value;
  }
  return out as GameSettings;
}

/** `content` played with the game's settings. */
export function withSettings(content: Content, settings: Readonly<Record<string, unknown>> | undefined): Content {
  return { ...content, settings: gameSettingsOf(settings) };
}
