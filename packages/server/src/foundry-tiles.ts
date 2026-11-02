import { z } from 'zod';

// Which Foundry tiles are roofs. v10-v11 mark them `overhead` (and `roof`);
// v12+ put a tile overhead when it stands at or above the scene's
// foreground elevation; Better Roofs marks its own with `brMode`. A roof's
// occlusion alpha is how see-through it gets while a token is under it.

const num = z.number().optional().catch(undefined);
const str = z.string().optional().catch(undefined);

export const FoundryTile = z.object({
  texture: z.object({ src: str.nullable() }).optional().catch(undefined),
  img: str.nullable(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  sort: num,
  z: num,
  elevation: num,
  overhead: z.boolean().optional().catch(undefined),
  roof: z.boolean().optional().catch(undefined),
  occlusion: z
    .object({ mode: num, modes: z.array(z.number()).optional().catch(undefined), alpha: num })
    .optional()
    .catch(undefined),
  flags: z
    .object({ betterroofs: z.object({ brMode: num }).optional().catch(undefined) })
    .optional()
    .catch(undefined),
});
export type FoundryTileData = z.infer<typeof FoundryTile>;

/** Whether a tile is drawn over the tokens; `foreground` is the scene's foreground elevation (v12+). */
export function isOverhead(t: FoundryTileData, foreground: number | undefined): boolean {
  if (t.overhead || t.roof || (t.flags?.betterroofs?.brMode ?? 0) > 0) return true;
  return foreground !== undefined && t.elevation !== undefined && t.elevation >= foreground;
}

/** The roof fields of one of our tiles: none for a floor tile; the alpha only when it isn't fully hidden. */
export function roofOf(
  t: FoundryTileData,
  foreground: number | undefined,
): { overhead?: true; occludedAlpha?: number } {
  if (!isOverhead(t, foreground)) return {};
  const alpha = Math.min(1, Math.max(0, t.occlusion?.alpha ?? 0));
  return { overhead: true, ...(alpha > 0 ? { occludedAlpha: alpha } : {}) };
}
