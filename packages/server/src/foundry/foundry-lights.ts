import type { Light, PlacedLight } from '@vtt/shared';
import { z } from 'zod';

// A Foundry light as one of ours. v10+ keeps the look in `config`; v9 had
// it on the light itself. Foundry's defaults (luminosity 0.5, attenuation
// 0.5, colour alpha 0.5, a full circle that walls stop) become ours by
// leaving the field out.

const num = z.number().optional().catch(undefined);
const str = z.string().optional().catch(undefined);

export const FoundryLight = z.object({
  x: z.number(),
  y: z.number(),
  config: z
    .object({
      bright: num,
      dim: num,
      color: str.nullable(),
      negative: z.boolean().optional(),
      animation: z.object({ type: str.nullable() }).optional(),
      angle: num,
      luminosity: num,
      attenuation: num,
      alpha: num,
      /** The darkness it shines in (v10+): 0.55 to 1 is "only at night". */
      darkness: z.object({ min: num, max: num }).optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
  bright: num,
  dim: num,
  angle: num,
  rotation: num,
  walls: z.boolean().optional().catch(undefined),
  /** v9: "u" is a light no wall stops. */
  t: str,
  tintColor: str.nullable(),
  tintAlpha: num,
  lightAnimation: z.object({ type: str.nullable() }).optional().catch(undefined),
});
type FoundryLightData = z.infer<typeof FoundryLight>;

const ANIMATIONS: Record<string, Light['animation']> = {
  torch: 'flicker',
  flame: 'flicker',
  fairy: 'pulse',
  pulse: 'pulse',
};

const unit = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;

/** A light's colour, animation and whether it is darkness. */
function lightLook(l: FoundryLightData): Pick<Light, 'color' | 'animation' | 'darkness'> {
  const c = l.config ?? {};
  const color = c.color ?? l.tintColor;
  const animation = ANIMATIONS[c.animation?.type ?? l.lightAnimation?.type ?? ''];
  return {
    ...(color ? { color } : {}),
    ...(animation ? { animation } : {}),
    ...(c.negative ? { darkness: true } : {}),
  };
}

/** Its beam and whether walls stop it. */
function lightAim(l: FoundryLightData): Pick<Light, 'angle' | 'rotation' | 'walls'> {
  const angle = l.config?.angle ?? l.angle ?? 360;
  const beam = angle > 0 && angle < 360;
  const through = l.walls === false || l.t === 'u';
  return {
    ...(beam ? { angle } : {}),
    ...(beam && l.rotation ? { rotation: l.rotation } : {}),
    ...(through ? { walls: false } : {}),
  };
}

/** How strongly it shines, how softly it fades and how much colour it casts (Foundry's are half ours). */
function lightDepth(l: FoundryLightData): Pick<Light, 'luminosity' | 'attenuation' | 'colorIntensity'> {
  const c = l.config ?? {};
  const luminosity = unit((c.luminosity ?? 0.5) * 2);
  const attenuation = unit(c.attenuation ?? 0.5);
  const colorIntensity = unit((c.alpha ?? l.tintAlpha ?? 0.5) * 2);
  return {
    ...(luminosity !== 1 ? { luminosity } : {}),
    ...(attenuation !== 0.5 ? { attenuation } : {}),
    ...(colorIntensity !== 1 ? { colorIntensity } : {}),
  };
}

/** When it shines, if not always: the band of the scene's darkness it is on in. */
function lightTime(l: FoundryLightData): Pick<PlacedLight, 'activeAt'> {
  const band: [number, number] = [unit(l.config?.darkness?.min ?? 0), unit(l.config?.darkness?.max ?? 1)];
  return band[0] > 0 || band[1] < 1 ? { activeAt: band } : {};
}

/** One light without its id, or undefined if it sheds none; radii in feet. */
function lightOf(l: FoundryLightData, feet: (units: number) => number): Omit<PlacedLight, 'id'> | undefined {
  const [bright, dim] = [feet(l.config?.bright ?? l.bright ?? 0), feet(l.config?.dim ?? l.dim ?? 0)];
  if (!bright && !dim) return undefined;
  return { x: l.x, y: l.y, bright, dim, ...lightLook(l), ...lightAim(l), ...lightDepth(l), ...lightTime(l) };
}

/** A scene's lights as ours, numbered; `feet` turns Foundry's grid units into feet. */
export function foundryLights(
  lights: readonly FoundryLightData[],
  feet: (units: number) => number,
  floor: (l: FoundryLightData) => { level?: string; levels?: string[] } = () => ({}),
): PlacedLight[] {
  return lights
    .flatMap((l) => {
      const light = lightOf(l, feet);
      return light ? [{ ...light, ...floor(l) }] : [];
    })
    .map((light, i) => ({ id: `light-${i + 1}`, ...light }));
}
