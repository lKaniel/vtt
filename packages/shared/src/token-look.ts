import { z } from 'zod';

// How a token looks on the map, the same in every game system: when its
// name and bars show (Foundry's display modes), how big its picture is drawn
// in its square, whether it is mirrored, and a coloured ring round it.

/** When a token's name or bars show: never, while you control it, on hover (for owners or anyone), to owners, or always. */
export const DisplayModeSchema = z.enum(['never', 'control', 'ownerHover', 'hover', 'owner', 'always']);
export type DisplayMode = z.infer<typeof DisplayModeSchema>;

/** The look fields a system adds to its token schema. */
export const TokenLookSchema = {
  /** When its name shows; missing = always. */
  displayName: DisplayModeSchema.optional(),
  /** When its bars (hit points in D&D) show; missing = always. */
  displayBars: DisplayModeSchema.optional(),
  /** How big its picture is drawn in its square, 0.2 to 3 (default 1). */
  scale: z.number().min(0.2).max(3).optional(),
  /** Flips its picture left to right, or upside down. */
  mirrorX: z.boolean().optional(),
  mirrorY: z.boolean().optional(),
  /** A coloured ring round its picture, on a background colour, like Foundry's token rings. */
  ring: z.object({ color: z.string().optional(), background: z.string().optional() }).optional(),
};
export type TokenLook = { [K in keyof typeof TokenLookSchema]?: z.infer<(typeof TokenLookSchema)[K]> };

/** How you stand to a token right now. The GM counts as an owner. */
export interface Onlooker {
  owner: boolean;
  /** You have it selected. */
  controlled: boolean;
  hovered: boolean;
}

/** Whether a name or bar in `mode` shows to `you`. */
export function displays(mode: DisplayMode | undefined, you: Onlooker): boolean {
  switch (mode ?? 'always') {
    case 'never':
      return false;
    case 'control':
      return you.owner && you.controlled;
    case 'ownerHover':
      return you.owner && you.hovered;
    case 'hover':
      return you.hovered;
    case 'owner':
      return you.owner;
    case 'always':
      return true;
  }
}

/** The x and y scale its picture is drawn at: its size, negative when mirrored. */
export function lookTransform(look: TokenLook): { x: number; y: number } {
  const s = look.scale ?? 1;
  return { x: look.mirrorX ? -s : s, y: look.mirrorY ? -s : s };
}
