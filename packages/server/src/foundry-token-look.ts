import type { DisplayMode, TokenLook } from '@vtt/shared';
import { z } from 'zod';

// A Foundry token's (or prototype token's) look as ours: display modes,
// picture scale and mirroring (v10+ negative texture scale, v9 mirrorX/Y and
// scale), and the dynamic token ring. Defaults are left out.

const num = z.number().optional().catch(undefined);
const str = z.string().nullable().optional().catch(undefined);

const FoundryLook = z
  .object({
    displayName: num,
    displayBars: num,
    texture: z.object({ scaleX: num, scaleY: num }).optional().catch(undefined),
    scale: num,
    mirrorX: z.boolean().optional().catch(undefined),
    mirrorY: z.boolean().optional().catch(undefined),
    ring: z
      .object({
        enabled: z.boolean().optional().catch(undefined),
        colors: z.object({ ring: str, background: str }).optional().catch(undefined),
      })
      .optional()
      .catch(undefined),
  })
  .catch({});

/** Foundry's CONST.TOKEN_DISPLAY_MODES. */
const MODES: Record<number, DisplayMode> = {
  0: 'never',
  10: 'control',
  20: 'ownerHover',
  30: 'hover',
  40: 'owner',
  50: 'always',
};

function modes(l: z.infer<typeof FoundryLook>): TokenLook {
  const name = l.displayName === undefined ? undefined : MODES[l.displayName];
  const bars = l.displayBars === undefined ? undefined : MODES[l.displayBars];
  return {
    ...(name && name !== 'always' ? { displayName: name } : {}),
    ...(bars && bars !== 'always' ? { displayBars: bars } : {}),
  };
}

/** One axis's scale: v10+ texture scale, else v9's scale, negative when mirrored. */
function axis(texture: number | undefined, scale: number | undefined, mirror: boolean | undefined): number {
  if (texture !== undefined) return texture;
  const s = scale ?? 1;
  return mirror ? -s : s;
}

function sizing(l: z.infer<typeof FoundryLook>): TokenLook {
  const sx = axis(l.texture?.scaleX, l.scale, l.mirrorX);
  const sy = axis(l.texture?.scaleY, l.scale, l.mirrorY);
  const scale = Math.min(3, Math.max(0.2, Math.abs(sx)));
  return {
    ...(scale !== 1 ? { scale } : {}),
    ...(sx < 0 ? { mirrorX: true } : {}),
    ...(sy < 0 ? { mirrorY: true } : {}),
  };
}

function ringOf(l: z.infer<typeof FoundryLook>): TokenLook {
  if (!l.ring?.enabled) return {};
  const { ring: color, background } = l.ring.colors ?? {};
  return { ring: { ...(color ? { color } : {}), ...(background ? { background } : {}) } };
}

/** The look fields of a Foundry token or prototype token. */
export function foundryTokenLook(data: unknown): TokenLook {
  const l = FoundryLook.parse(data);
  return { ...modes(l), ...sizing(l), ...ringOf(l) };
}
