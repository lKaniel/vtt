import type { ImportLoss } from '@vtt/core';
import type { Tile } from '@vtt/shared';

type ImageTile = Extract<Tile, { kind: 'image' }>;
import { lost } from './import-losses.ts';
import { z } from 'zod';

// Which Foundry tiles are roofs. v10-v11 mark them `overhead` (and `roof`);
// v12+ put a tile overhead when it stands at or above the scene's
// foreground elevation; Better Roofs marks its own with `brMode`. A roof's
// occlusion alpha is how see-through it gets while a token is under it.

const num = z.number().optional().catch(undefined);
const str = z.string().optional().catch(undefined);

const bool = z.boolean().optional().catch(undefined);

export const FoundryTile = z.object({
  texture: z
    .object({ src: str.nullable(), scaleX: num, scaleY: num, tint: str.nullable(), anchorX: num, anchorY: num })
    .optional()
    .catch(undefined),
  img: str.nullable(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  sort: num,
  z: num,
  elevation: num,
  rotation: num,
  alpha: num,
  hidden: bool,
  overhead: z.boolean().optional().catch(undefined),
  roof: z.boolean().optional().catch(undefined),
  occlusion: z
    .object({ mode: num, modes: z.array(z.number()).optional().catch(undefined), alpha: num })
    .optional()
    .catch(undefined),
  flags: z
    .object({
      /** A number before v12, `true` after. */
      betterroofs: z
        .object({ brMode: z.union([z.number(), z.boolean()]).optional().catch(undefined) })
        .optional()
        .catch(undefined),
      'monks-active-tiles': z
        .object({ actions: z.array(z.object({ action: str })).catch([]) })
        .optional()
        .catch(undefined),
    })
    .optional()
    .catch(undefined),
});
export type FoundryTileData = z.infer<typeof FoundryTile>;

/** What Monk's Active Tiles did on these tiles (its triggers stay behind): a report line, if any. */
export function activeTilesNote(tiles: FoundryTileData[]): ImportLoss | undefined {
  const acting = tiles.filter((t) => t.flags?.['monks-active-tiles']?.actions.length);
  if (!acting.length) return undefined;
  const actions = new Set(acting.flatMap((t) => t.flags!['monks-active-tiles']!.actions.map((a) => a.action ?? '?')));
  return lost("Monk's Active Tiles triggers (the tile comes, not what it does)", acting.length, [...actions]);
}

/**
 * Whether a tile is drawn over the tokens; `foreground` is the scene's
 * foreground elevation (v12+), `above` says it stands over every floor (a
 * roof with Levels, whatever Better Roofs says).
 */
export function isOverhead(t: FoundryTileData, foreground: number | undefined, above = false): boolean {
  if (above || t.overhead || t.roof || Number(t.flags?.betterroofs?.brMode ?? 0) > 0) return true;
  return foreground !== undefined && t.elevation !== undefined && t.elevation >= foreground;
}

/** The roof fields of one of our tiles: none for a floor tile; the alpha only when it isn't fully hidden. */
export function roofOf(
  t: FoundryTileData,
  foreground: number | undefined,
  above = false,
): { overhead?: true; occludedAlpha?: number } {
  if (!isOverhead(t, foreground, above)) return {};
  const alpha = Math.min(1, Math.max(0, t.occlusion?.alpha ?? 0));
  return { overhead: true, ...(alpha > 0 ? { occludedAlpha: alpha } : {}) };
}

type Look = Partial<Pick<ImageTile, 'rotation' | 'flipX' | 'flipY' | 'alpha' | 'tint' | 'hidden'>>;

/** Only the fields that differ from a plain tile. */
const some = (look: Record<string, unknown>): Look =>
  Object.fromEntries(Object.entries(look).filter(([, v]) => v !== undefined && v !== false));

/** How the tile's picture looks beyond its rectangle: turned, mirrored, see-through, tinted, hidden. */
export function lookOf(t: FoundryTileData): Look {
  const rotation = (((t.rotation ?? 0) % 360) + 360) % 360;
  const tint = t.texture?.tint?.toLowerCase();
  const alpha = Math.max(0, t.alpha ?? 1);
  return some({
    rotation: rotation || undefined,
    flipX: (t.texture?.scaleX ?? 1) < 0,
    flipY: (t.texture?.scaleY ?? 1) < 0,
    tint: tint === '#ffffff' ? undefined : tint,
    alpha: alpha < 1 ? alpha : undefined,
    hidden: t.hidden,
  });
}

/**
 * Where the tile's rectangle starts, unturned. Before v14 a tile's x and y
 * are its top-left corner; from v14 they are where its anchor is (a fraction
 * of its size, the centre for tiles placed in v14), and it turns about that.
 */
export function topLeftOf(t: FoundryTileData, anchored: boolean): { x: number; y: number } {
  if (!anchored) return { x: t.x, y: t.y };
  const [ax, ay] = [t.width * (t.texture?.anchorX ?? 0), t.height * (t.texture?.anchorY ?? 0)];
  const a = ((t.rotation ?? 0) * Math.PI) / 180;
  const [dx, dy] = [t.width / 2 - ax, t.height / 2 - ay];
  const cx = t.x + dx * Math.cos(a) - dy * Math.sin(a);
  const cy = t.y + dx * Math.sin(a) + dy * Math.cos(a);
  const round = (n: number) => Math.round(n * 100) / 100;
  return { x: round(cx - t.width / 2), y: round(cy - t.height / 2) };
}
