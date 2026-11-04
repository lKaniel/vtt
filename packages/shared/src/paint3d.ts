import { z } from 'zod';

// How 3D Canvas repaints a model or terrain on top of its own pictures (its
// colorswap and overlay shaders): the 3D view (client view3d/paint3d.ts)
// paints the same. Colours here are 3D Canvas's: their channels are used as
// they are, not turned from sRGB, so a tint of #545454 keeps a third of the
// light.

/** Where a colour lies within `within` (a share of the widest gap) of `from`, its brightness tints `to` instead. */
export const ColorSwapSchema = z.object({
  from: z.string(),
  to: z.string(),
  within: z.number().positive().max(1),
});

/** A picture laid over the top: leaves, moss, snow. */
export const OverlaySchema = z.object({
  src: z.string(),
  color: z.string().optional(),
  /** How much it covers what is under it, 0–1. */
  strength: z.number().min(0).max(1),
  /** Times the picture repeats across it. */
  repeat: z.number().positive().optional(),
  /** Up to what share of its height it shows (from the top when negative); none = all of it. */
  cover: z.number().min(-1).max(1).optional(),
  /** How flat a spot must be (0–1) to take it (how steep when negative); none = any. */
  slope: z.number().min(-1).max(1).optional(),
  /** Its black parts leave what is under them. */
  blackClear: z.boolean().optional(),
  /** `add` or `multiply` it into what is under it, instead of laying it over. */
  blend: z.enum(['add', 'multiply']).optional(),
});

export const Paint3DSchema = z.object({
  /** Up to three swaps; the first that matches a spot paints it. */
  swaps: z.array(ColorSwapSchema).max(3).optional(),
  overlay: OverlaySchema.optional(),
});
export type ColorSwap = z.infer<typeof ColorSwapSchema>;
export type Overlay = z.infer<typeof OverlaySchema>;
export type Paint3D = z.infer<typeof Paint3DSchema>;
